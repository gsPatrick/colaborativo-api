const projectService = require('./project.service');

// Criar um novo projeto
exports.create = async (req, res) => {
  try {
    const ownerId = req.user.id;
    // --- CORREÇÃO AQUI ---
    // Inclui platformCommissionPercent, partnerId, commissionType, commissionValue
    const project = await projectService.createProject(req.body, ownerId);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ message: "Erro ao criar projeto", error: error.message });
  }
};

// Listar todos os projetos do usuário
exports.findAll = async (req, res) => {
  try {
    const userId = req.user.id;
    // Passa todos os query params para o service
    const results = await projectService.findAllProjectsForUser(userId, req.query);
    res.status(200).json(results);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar projetos", error: error.message });
  }
};
// Obter um projeto específico
exports.findOne = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const project = await projectService.findProjectById(projectId, userId);
    res.status(200).json(project);
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao buscar projeto", error: error.message });
  }
};

// Atualizar um projeto
exports.update = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const project = await projectService.updateProject(projectId, req.body, userId);
    res.status(200).json(project);
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao atualizar projeto", error: error.message });
  }
};

// Deletar um projeto
exports.delete = async (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    await projectService.deleteProject(projectId, userId);
    res.status(204).send();
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao deletar projeto", error: error.message });
  }
};

// Compartilhar um projeto
exports.share = async (req, res) => {
    try {
        const projectId = req.params.id;
        const ownerId = req.user.id;
        const result = await projectService.shareProject(projectId, ownerId, req.body);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: "Erro ao compartilhar projeto", error: error.message });
    }
};

// Parar de compartilhar um projeto
exports.stopSharing = async (req, res) => {
    try {
        const { id: projectId, partnerId } = req.params;
        const ownerId = req.user.id;
        const result = await projectService.stopSharingProject(projectId, ownerId, partnerId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: "Erro ao remover compartilhamento", error: error.message });
    }
};

/**
 * Registra um valor como recebido pelo usuário logado (dono ou parceiro).
 */
exports.registerReceipt = async (req, res) => {
    try {
        const projectId = req.params.id;
        const userId = req.user.id;
        const { amount, isFullPayment } = req.body; // amount é o valor a ser adicionado

        const updatedProject = await projectService.registerUserReceipt(projectId, userId, amount, isFullPayment);
        res.status(200).json(updatedProject);
    } catch (error) {
        res.status(400).json({ message: "Erro ao registrar recebimento", error: error.message });
    }
};