const db = require('../../models');
const Project = db.Project;
const Transaction = db.Transaction;
const ProjectShare = db.ProjectShare;

// Função auxiliar para recalcular e atualizar o status de pagamento de um projeto
const updateProjectPaymentStatus = async (projectId, t) => {
    const project = await Project.findByPk(projectId, { 
        include: ['Transactions', { model: ProjectShare, as: 'ProjectShares' }] 
    });
    if (!project) return;

    const budget = parseFloat(project.budget);
    const platformCommissionPercent = parseFloat(project.platformCommissionPercent || 0);

    // 1. Recalcular total pago pelo CLIENTE
    const totalPaidByClient = project.Transactions.reduce((sum, tr) => sum + parseFloat(tr.amount), 0);
    
    let clientStatus = 'partial';
    if (totalPaidByClient <= 0) clientStatus = 'unpaid';
    else if (totalPaidByClient >= budget) clientStatus = 'paid';

    // 2. Calcular o VALOR LÍQUIDO BRUTO (após plataforma) para o DONO e PARCEIROS
    const totalAfterPlatformCommission = budget * (1 - (platformCommissionPercent / 100));

    // 3. Calcular o quanto o DONO deve receber e já recebeu
    let ownerExpectedAmount = 0;
    if (project.ownerCommissionType === 'percentage') {
        ownerExpectedAmount = totalAfterPlatformCommission * (parseFloat(project.ownerCommissionValue || 0) / 100);
    } else if (project.ownerCommissionType === 'fixed') {
        ownerExpectedAmount = parseFloat(project.ownerCommissionValue || 0);
    } else { // Se não tiver ownerCommissionType, o dono fica com o restante após parceiros
        ownerExpectedAmount = totalAfterPlatformCommission; // Valor inicial, será subtraído pelas comissões dos parceiros
    }

    // 4. Recalcular o quanto cada PARCEIRO deve receber e já recebeu (atualiza ProjectShare)
    const newPartnersPaymentStatus = {};
    for (let share of project.ProjectShares) {
        const partnerExpectedAmount = share.commissionType === 'percentage'
            ? totalAfterPlatformCommission * (parseFloat(share.commissionValue) / 100)
            : parseFloat(share.commissionValue);

        // O 'amountPaid' do parceiro é um campo em ProjectShare
        // A lógica do front-end irá chamar um endpoint de 'pagar parceiro', que atualiza share.amountPaid.
        // Aqui, apenas atualizamos o status baseado no 'amountPaid' atual.
        let partnerPaymentStatus = 'partial';
        if (share.amountPaid <= 0) partnerPaymentStatus = 'unpaid';
        else if (share.amountPaid >= partnerExpectedAmount) partnerPaymentStatus = 'paid';

        await share.update({ paymentStatus: partnerPaymentStatus }, { transaction: t });
        
        // Se o dono não tem um valor fixo, o restante é o dele
        if (!project.ownerCommissionType) {
            ownerExpectedAmount -= partnerExpectedAmount; // Subtrai a parte do parceiro do que o dono recebe
        }
        newPartnersPaymentStatus[share.partnerId] = { status: partnerPaymentStatus, amountReceived: parseFloat(share.amountPaid) };
    }
    
    // Atualiza o valor recebido pelo DONO
    let ownerPaymentStatus = 'partial';
    if (project.paymentDetails.owner.amountReceived <= 0) ownerPaymentStatus = 'unpaid';
    else if (project.paymentDetails.owner.amountReceived >= ownerExpectedAmount) ownerPaymentStatus = 'paid';


    // 5. Atualizar paymentDetails do Projeto
    project.paymentDetails = {
        client: { status: clientStatus, amountPaid: totalPaidByClient.toFixed(2) },
        owner: { status: ownerPaymentStatus, amountReceived: parseFloat(project.paymentDetails.owner.amountReceived).toFixed(2) },
        partners: newPartnersPaymentStatus
    };

    await project.save({ transaction: t });
};

/**
 * Verifica se o usuário tem permissão para adicionar/ver transações em um projeto.
 * Permite acesso se for dono OU parceiro (com permissão de leitura, por exemplo).
 */
const checkProjectAccessForTransactions = async (projectId, userId) => {
    const project = await Project.findByPk(projectId, { include: [{ model: ProjectShare, as: 'ProjectShares' }] });
    if (!project) throw new Error("Projeto não encontrado.");

    const isOwner = project.ownerId === userId;
    const isPartner = project.ProjectShares && project.ProjectShares.some(share => share.partnerId === userId);

    if (!isOwner && !isPartner) {
        throw new Error("Acesso negado. Você não tem permissão para este projeto.");
    }
    return project;
};

/**
 * Lista todas as transações de um projeto.
 */
exports.findAllTransactionsByProject = async (projectId, userId) => {
    await checkProjectAccessForTransactions(projectId, userId);
    const transactions = await Transaction.findAll({
        where: { projectId },
        order: [['paymentDate', 'DESC']]
    });
    return transactions;
};

/**
 * Cria uma transação.
 * Permite que apenas o dono ou um parceiro com permissão 'edit' registre transações.
 */
exports.createTransaction = async (projectId, userId, transactionData) => {
    const t = await db.sequelize.transaction();
    try {
        const project = await checkProjectAccessForTransactions(projectId, userId);
        
        const isOwner = project.ownerId === userId;
        const partnerShare = project.ProjectShares ? project.ProjectShares.find(share => share.partnerId === userId) : null;
        if (!isOwner && (!partnerShare || partnerShare.permissions !== 'edit')) {
            throw new Error("Acesso negado. Você não tem permissão para registrar transações neste projeto.");
        }

        // Validação básica do amount
        if (parseFloat(transactionData.amount) <= 0) {
            throw new Error("O valor da transação deve ser positivo.");
        }

        const newTransaction = await Transaction.create({ ...transactionData, projectId }, { transaction: t });
        await updateProjectPaymentStatus(projectId, t);
        await t.commit();
        return newTransaction;
    } catch (error) {
        await t.rollback();
        throw error;
    }
};

/**
 * Deleta uma transação.
 * Permite que apenas o dono ou um parceiro com permissão 'edit' delete transações.
 */
exports.deleteTransaction = async (transactionId, userId) => {
    const t = await db.sequelize.transaction();
    try {
        const transaction = await Transaction.findByPk(transactionId, { include: [Project] });
        if (!transaction) throw new Error("Transação não encontrada.");

        const project = await checkProjectAccessForTransactions(transaction.projectId, userId);
        
        const isOwner = project.ownerId === userId;
        const partnerShare = project.ProjectShares ? project.ProjectShares.find(share => share.partnerId === userId) : null;
        if (!isOwner && (!partnerShare || partnerShare.permissions !== 'edit')) {
            throw new Error("Acesso negado. Você não tem permissão para deletar transações neste projeto.");
        }
        
        await transaction.destroy({ transaction: t });
        await updateProjectPaymentStatus(transaction.projectId, t); // Atualiza o projeto após exclusão
        await t.commit();
        return { message: "Registro de transação deletado com sucesso." };
    } catch (error) {
        await t.rollback();
        throw error;
    }
};