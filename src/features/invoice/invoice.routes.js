const express = require('express');
const router = express.Router();
const invoiceController = require('./invoice.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// Aplica o middleware de autenticação a todas as rotas de faturamento
router.use(authMiddleware);

/**
 * @route   POST /api/projects/:projectId/invoices
 * @desc    Cria (emite) uma nova nota fiscal para um projeto específico.
 * @access  Private
 */
router.post('/projects/:projectId/invoices', invoiceController.create);

/**
 * @route   GET /api/projects/:projectId/invoices
 * @desc    Lista todas as faturas emitidas para um projeto.
 * @access  Private
 */
router.get('/projects/:projectId/invoices', invoiceController.findAllByProject);

/**
 * @route   GET /api/invoices/:invoiceId
 * @desc    Busca os detalhes de uma fatura específica.
 * @access  Private
 */
router.get('/invoices/:invoiceId', invoiceController.findOne);


module.exports = router;