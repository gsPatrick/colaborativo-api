const express = require('express');
const router = express.Router();
const priorityController = require('./priority.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// Aplica o middleware de autenticação a TODAS as rotas deste arquivo
router.use(authMiddleware);

// Rotas de CRUD para Prioridades
router.post('/', priorityController.create);
router.get('/', priorityController.findAll);
router.patch('/:id', priorityController.update);
router.delete('/:id', priorityController.delete);

module.exports = router;