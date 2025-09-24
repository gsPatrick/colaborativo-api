const db = require('../../models');
const Project = db.Project;
const Transaction = db.Transaction;


const checkProjectAccessForTransactions = async (projectId, userId) => {
    const project = await Project.findByPk(projectId, { include: [ProjectShare] });
    if (!project) throw new Error("Projeto não encontrado.");

    const isOwner = project.ownerId === userId;
    const isPartner = project.ProjectShares.some(share => share.partnerId === userId);

    if (!isOwner && !isPartner) {
        throw new Error("Acesso negado. Você não tem permissão para este projeto.");
    }
    return project; // Retorna o projeto se tiver acesso
};


// --- FUNÇÃO NOVA ---
exports.findAllTransactionsByProject = async (projectId, userId) => {
    // Usa a nova função de verificação de acesso
    await checkProjectAccessForTransactions(projectId, userId);

    const transactions = await Transaction.findAll({
        where: { projectId },
        order: [['paymentDate', 'DESC']]
    });
    return transactions;
};

// Função auxiliar para recalcular e atualizar o status de pagamento de um projeto
const updateProjectPaymentStatus = async (projectId, transaction) => {
    const project = await Project.findByPk(projectId, { include: ['Transactions'] });
    if (!project) return;

    const totalPaid = project.Transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const budget = parseFloat(project.budget);
    let newStatus = 'partial';

    if (totalPaid <= 0) {
        newStatus = 'unpaid';
    } else if (totalPaid >= budget) {
        newStatus = 'paid';
    }

    project.paymentDetails = {
        ...project.paymentDetails,
        clientStatus: newStatus,
        clientAmountPaid: totalPaid.toFixed(2),
    };

    await project.save({ transaction }); // Passa a transação para o save
};

exports.createTransaction = async (projectId, userId, transactionData) => {
    const t = await db.sequelize.transaction();
    try {
        // Usa a nova função de verificação de acesso
        const project = await checkProjectAccessForTransactions(projectId, userId);
        
        // CORREÇÃO: Garante que apenas quem tem permissão de edição possa criar
        const isOwner = project.ownerId === userId;
        const partnerShare = project.ProjectShares.find(share => share.partnerId === userId);
        if (!isOwner && (!partnerShare || partnerShare.permissions !== 'edit')) {
            throw new Error("Acesso negado. Você não tem permissão para registrar transações neste projeto.");
        }

        const newTransaction = await Transaction.create({
            ...transactionData,
            projectId,
        }, { transaction: t });

        await updateProjectPaymentStatus(projectId, t);

        await t.commit();
        return newTransaction;
    } catch (error) {
        await t.rollback();
        throw error;
    }
};

exports.deleteTransaction = async (transactionId, userId) => {
    const t = await db.sequelize.transaction();
    try {
        const transaction = await Transaction.findByPk(transactionId, { include: [Project] });
        if (!transaction) throw new Error("Transação não encontrada.");

        // Usa a nova função de verificação de acesso para o projeto da transação
        const project = await checkProjectAccessForTransactions(transaction.projectId, userId);

        // CORREÇÃO: Garante que apenas quem tem permissão de edição possa deletar
        const isOwner = project.ownerId === userId;
        const partnerShare = project.ProjectShares.find(share => share.partnerId === userId);
        if (!isOwner && (!partnerShare || partnerShare.permissions !== 'edit')) {
            throw new Error("Acesso negado. Você não tem permissão para deletar transações neste projeto.");
        }
        
        const projectId = transaction.projectId;
        await transaction.destroy({ transaction: t });
        
        await updateProjectPaymentStatus(projectId, t);

        await t.commit();
        return { message: "Transação deletada com sucesso." };
    } catch (error) {
        await t.rollback();
        throw error;
    }
};