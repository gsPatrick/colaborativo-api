const clientService = require('./client.service');

// Criar um novo cliente
exports.create = async (req, res) => {
  try {
    const ownerId = req.user.id; // Vem do middleware de autenticação
    const client = await clientService.createClient(req.body, ownerId);
    res.status(201).json(client);
  } catch (error) {
    res.status(400).json({ message: "Erro ao criar cliente", error: error.message });
  }
};

// Listar todos os clientes do usuário (próprios e compartilhados)
exports.findAll = async (req, res) => {
  try {
    const userId = req.user.id;
    const clients = await clientService.findAllClientsForUser(userId);
    res.status(200).json(clients);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar clientes", error: error.message });
  }
};

// Obter detalhes de um cliente específico
exports.findOne = async (req, res) => {
  try {
    const clientId = req.params.id;
    const userId = req.user.id;
    const client = await clientService.findClientById(clientId, userId);
    res.status(200).json(client);
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao buscar cliente", error: error.message });
  }
};

// Atualizar um cliente
exports.update = async (req, res) => {
  try {
    const clientId = req.params.id;
    const userId = req.user.id;
    const client = await clientService.updateClient(clientId, req.body, userId);
    res.status(200).json(client);
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao atualizar cliente", error: error.message });
  }
};

// Deletar um cliente
exports.delete = async (req, res) => {
  try {
    const clientId = req.params.id;
    const userId = req.user.id;
    const result = await clientService.deleteClient(clientId, userId);
    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message.includes("Acesso negado") ? 403 : 404;
    res.status(statusCode).json({ message: "Erro ao deletar cliente", error: error.message });
  }
};

// Compartilhar um cliente
exports.share = async (req, res) => {
    try {
        const clientId = req.params.id;
        const ownerId = req.user.id;
        const { partnerEmail } = req.body; // Recebe o email do colaborador
        const result = await clientService.shareClientWithPartner(clientId, ownerId, partnerEmail);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: "Erro ao compartilhar cliente", error: error.message });
    }
};

// Parar de compartilhar um cliente
exports.stopSharing = async (req, res) => {
    try {
        const { id: clientId, partnerId } = req.params;
        const ownerId = req.user.id;
        const result = await clientService.stopSharingClient(clientId, ownerId, partnerId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ message: "Erro ao remover compartilhamento", error: error.message });
    }
};