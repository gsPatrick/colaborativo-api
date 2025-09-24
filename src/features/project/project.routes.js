const express = require('express');
const router = express.Router();
const projectController = require('./project.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

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

// --- NOVA ROTA: Registrar recebimento do usuário logado ---
/**
 * @route   PATCH /api/projects/:id/register-receipt
 * @desc    Registra um valor como recebido pelo usuário logado (dono ou parceiro).
 * @access  Private
 */
router.patch('/projects/:id/register-receipt', projectController.registerReceipt);

module.exports = router;