const priorityService = require('./priority.service');

// Criar nova prioridade
exports.create = async (req, res) => {
  try {
    const userId = req.user.id;
    const priority = await priorityService.createPriority(req.body, userId);
    res.status(201).json(priority);
  } catch (error) {
    res.status(400).json({ message: "Erro ao criar prioridade", error: error.message });
  }
};

// Listar todas as prioridades do usuário
exports.findAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const priorities = await priorityService.findPrioritiesByUser(userId);
    res.status(200).json(priorities);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar prioridades", error: error.message });
  }
};

// Atualizar uma prioridade
exports.update = async (req, res) => {
  try {
    const priorityId = req.params.id;
    const userId = req.user.id;
    const priority = await priorityService.updatePriority(priorityId, req.body, userId);
    res.status(200).json(priority);
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao atualizar prioridade", error: error.message });
  }
};

// Deletar uma prioridade
exports.delete = async (req, res) => {
  try {
    const priorityId = req.params.id;
    const userId = req.user.id;
    await priorityService.deletePriority(priorityId, userId);
    res.status(204).send();
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao deletar prioridade", error: error.message });
  }
};