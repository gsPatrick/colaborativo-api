const express = require('express');
const router = express.Router();
const projectController = require('./project.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// Aplica o middleware de autenticação a TODAS as rotas deste arquivo
router.use(authMiddleware);

// Rotas de CRUD para Projetos
router.post('/', projectController.create);
router.get('/', projectController.findAll);
router.get('/:id', projectController.findOne);
router.patch('/:id', projectController.update);
router.delete('/:id', projectController.delete);

// Rotas para Compartilhamento de Projetos
router.post('/:id/share', projectController.share);
router.delete('/:id/share/:partnerId', projectController.stopSharing);

module.exports = router;