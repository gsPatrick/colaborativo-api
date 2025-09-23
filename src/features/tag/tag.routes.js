const express = require('express');
const router = express.Router();
const tagController = require('./tag.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// Aplica o middleware de autenticação a TODAS as rotas deste arquivo
router.use(authMiddleware);

// Rotas de CRUD para Tags
router.post('/', tagController.create);
router.get('/', tagController.findAll);
router.patch('/:id', tagController.update);
router.delete('/:id', tagController.delete);

module.exports = router;