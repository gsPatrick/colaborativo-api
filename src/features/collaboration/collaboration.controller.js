const collaborationService = require('./collaboration.service');

// Controller para enviar a solicitação
exports.sendRequest = async (req, res) => {
  try {
    // Em um sistema real, o requesterId viria de um token de autenticação (ex: req.user.id)
    // Por enquanto, vamos simular recebendo no body da requisição.
    const { requesterId, addresseeEmail } = req.body;
    
    const request = await collaborationService.createCollaborationRequest(requesterId, addresseeEmail);
    res.status(201).json(request);
  } catch (error) {
    res.status(400).json({ message: "Erro ao enviar solicitação", error: error.message });
  }
};

// Controller para listar as colaborações do usuário logado
exports.getMyCollaborations = async (req, res) => {
    try {
        // CORREÇÃO AQUI:
        // O ID do usuário logado agora vem do token de autenticação via middleware.
        const userId = req.user.id; 
        
        const { status } = req.query; // Filtro opcional por status

        const collaborations = await collaborationService.findUserCollaborations(userId, status);
        res.status(200).json(collaborations);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar colaborações", error: error.message });
    }
}

// Controller para aceitar/recusar uma solicitação
exports.updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'accepted' ou 'declined'
        
        // O ID do usuário logado (que está aceitando/recusando) viria do token
        const addresseeId = parseInt(req.body.userId, 10); // Simulando
        
        const updatedCollaboration = await collaborationService.updateCollaborationStatus(id, addresseeId, status);
        res.status(200).json(updatedCollaboration);
    } catch (error) {
        // Diferencia erro de permissão de outros erros
        if (error.message.includes("Permissão negada")) {
            return res.status(403).json({ message: error.message });
        }
        res.status(400).json({ message: "Erro ao atualizar solicitação", error: error.message });
    }
}

// Controller para cancelar ou revogar
exports.revokeOrCancel = async (req, res) => {
    try {
        const { id } = req.params;
        // O ID do usuário logado viria do token
        const userId = parseInt(req.body.userId, 10); // Simulando

        await collaborationService.cancelOrRevokeCollaboration(id, userId);
        res.status(204).send(); // 204 No Content é uma boa resposta para delete
    } catch (error) {
         if (error.message.includes("Permissão negada")) {
            return res.status(403).json({ message: error.message });
        }
        res.status(400).json({ message: "Erro ao remover colaboração", error: error.message });
    }
}