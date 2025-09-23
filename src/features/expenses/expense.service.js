const db = require('../../models');
const Expense = db.Expense;

exports.findAllExpenses = async (userId, filters) => {
    const whereClause = { userId };
    if (filters.projectId) {
        whereClause.projectId = filters.projectId;
    }
    return Expense.findAll({ where: whereClause, order: [['expenseDate', 'DESC']] });
};

exports.createExpense = async (userId, expenseData) => {
    return Expense.create({ ...expenseData, userId });
};

exports.deleteExpense = async (expenseId, userId) => {
    const expense = await Expense.findByPk(expenseId);
    if (!expense || expense.userId !== userId) {
        throw new Error("Despesa não encontrada ou acesso negado.");
    }
    await expense.destroy();
    return { message: "Despesa deletada." };
};