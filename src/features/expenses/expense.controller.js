const expenseService = require('./expense.service');

/**
 * Controller para criar uma nova despesa.
 */
exports.create = async (req, res) => {
  try {
    const userId = req.user.id; // Vem do middleware de autenticação
    const expenseData = req.body;

    const expense = await expenseService.createExpense(userId, expenseData);
    res.status(201).json(expense);
  } catch (error) {
    res.status(400).json({ message: "Erro ao criar despesa", error: error.message });
  }
};

/**
 * Controller para listar todas as despesas do usuário, com filtros opcionais.
 */
exports.findAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const filters = req.query; // Para filtros como ?projectId=123

    const expenses = await expenseService.findAllExpenses(userId, filters);
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar despesas", error: error.message });
  }
};

/**
 * Controller para deletar uma despesa.
 */
exports.delete = async (req, res) => {
  try {
    const userId = req.user.id;
    const expenseId = req.params.id;

    await expenseService.deleteExpense(expenseId, userId);
    res.status(204).send(); // Resposta padrão para sucesso em exclusão (No Content)
  } catch (error) {
    // Retorna um código de status mais específico se for um erro de permissão/não encontrado
    const statusCode = error.message.includes("acesso negado") || error.message.includes("não encontrada") 
      ? 404 
      : 400;
    res.status(statusCode).json({ message: "Erro ao deletar despesa", error: error.message });
  }
};