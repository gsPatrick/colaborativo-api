const express = require('express');
const router = express.Router();
const platformController = require('./platform.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

/**
 * @route   POST /api/platforms
 * @desc    Cria uma nova plataforma customizada para o usuário.
 * @access  Private
 */
router.post('/platforms', platformController.create);

/**
 * @route   GET /api/platforms
 * @desc    Lista todas as plataformas customizadas do usuário.
 * @access  Private
 */
router.get('/platforms', platformController.findAll);

/**
 * @route   PATCH /api/platforms/:id
 * @desc    Atualiza uma plataforma customizada existente.
 * @access  Private
 */
router.patch('/platforms/:id', platformController.update);

/**
 * @route   DELETE /api/platforms/:id
 * @desc    Deleta uma plataforma customizada.
 * @access  Private
 */
router.delete('/platforms/:id', platformController.delete);

module.exports = router;