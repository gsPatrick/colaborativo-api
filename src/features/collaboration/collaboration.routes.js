const express = require('express');
const router = express.Router();
const collaborationController = require('./collaboration.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// CORREÇÃO AQUI: Aplica o middleware de autenticação a TODAS as rotas deste arquivo
router.use(authMiddleware);

// Enviar uma nova solicitação de colaboração
router.post('/', collaborationController.sendRequest);

// Listar minhas colaborações (enviadas, recebidas, ativas)
router.get('/', collaborationController.getMyCollaborations);

// Atualizar o status de uma solicitação (aceitar/recusar)
router.patch('/:id', collaborationController.updateRequestStatus);

// Cancelar uma solicitação enviada ou revogar uma colaboração ativa
router.delete('/:id', collaborationController.revokeOrCancel);


module.exports = router;