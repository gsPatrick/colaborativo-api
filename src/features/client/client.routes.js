const express = require('express');
const router = express.Router();
const clientController = require('./client.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// Aplica o middleware de autenticação a TODAS as rotas deste arquivo
router.use(authMiddleware);

// Rotas de CRUD para Clientes
router.post('/', clientController.create);
router.get('/', clientController.findAll);
router.get('/:id', clientController.findOne);
router.patch('/:id', clientController.update);
router.delete('/:id', clientController.delete);

// Rotas para Compartilhamento de Clientes
router.post('/:id/share', clientController.share);
router.delete('/:id/share/:partnerId', clientController.stopSharing);

module.exports = router;