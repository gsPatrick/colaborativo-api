const db = require('../../models');
const Project = db.Project;
const Transaction = db.Transaction;


// --- FUNÇÃO NOVA ---
exports.findAllTransactionsByProject = async (projectId, userId) => {
    // Primeiro, verifica se o usuário tem acesso ao projeto
    const project = await Project.findByPk(projectId);
    if (!project || project.ownerId !== userId) { // Simplificado: apenas o dono vê o histórico
        throw new Error("Projeto não encontrado ou acesso negado.");
    }

    // Se tiver acesso, busca as transações
    const transactions = await Transaction.findAll({
        where: { projectId },
        order: [['paymentDate', 'DESC']] // Ordena da mais recente para a mais antiga
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
    const t = await db.sequelize.transaction(); // Inicia uma transação do Sequelize
    try {
        const project = await Project.findByPk(projectId);
        if (!project || project.ownerId !== userId) { // Simplificado: apenas o dono pode adicionar transações
            throw new Error("Projeto não encontrado ou acesso negado.");
        }

        const newTransaction = await Transaction.create({
            ...transactionData,
            projectId,
        }, { transaction: t });

        // Atualiza o status do projeto DENTRO da mesma transação de banco de dados
        await updateProjectPaymentStatus(projectId, t);

        await t.commit(); // Se tudo deu certo, confirma as alterações no banco
        return newTransaction;
    } catch (error) {
        await t.rollback(); // Se algo deu errado, desfaz tudo
        throw error;
    }
};

exports.deleteTransaction = async (transactionId, userId) => {
    const t = await db.sequelize.transaction();
    try {
        const transaction = await Transaction.findByPk(transactionId, { include: [Project] });
        if (!transaction || transaction.Project.ownerId !== userId) {
            throw new Error("Transação não encontrada ou acesso negado.");
        }
        
        const projectId = transaction.projectId;
        await transaction.destroy({ transaction: t });
        
        // Atualiza o status do projeto DENTRO da mesma transação
        await updateProjectPaymentStatus(projectId, t);

        await t.commit();
        return { message: "Transação deletada com sucesso." };
    } catch (error) {
        await t.rollback();
        throw error;
    }
};