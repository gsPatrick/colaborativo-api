const express = require('express');
const router = express.Router();
const transactionController = require('./transaction.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

// --- ROTA NOVA ---
// Listar todas as transações de um projeto específico
router.get('/projects/:projectId/transactions', transactionController.findAllByProject);

// Criar uma nova transação para um projeto
router.post('/projects/:projectId/transactions', transactionController.create);

// Deletar uma transação
router.delete('/transactions/:transactionId', transactionController.delete);

module.exports = router;