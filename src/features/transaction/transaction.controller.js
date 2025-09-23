const transactionService = require('./transaction.service');

exports.create = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;
    const transaction = await transactionService.createTransaction(projectId, userId, req.body);
    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ message: "Erro ao registrar transação", error: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user.id;
    await transactionService.deleteTransaction(transactionId, userId);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: "Erro ao deletar transação", error: error.message });
  }
};

// --- FUNÇÃO NOVA ---
exports.findAllByProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.id;
        const transactions = await transactionService.findAllTransactionsByProject(projectId, userId);
        res.status(200).json(transactions);
    } catch (error) {
        res.status(400).json({ message: "Erro ao buscar transações", error: error.message });
    }
};
