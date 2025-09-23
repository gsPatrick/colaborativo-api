const express = require('express');
const router = express.Router();
const timeEntryController = require('./timeEntry.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// 🔒 Aplica o middleware de autenticação a todas as rotas de time tracking
router.use(authMiddleware);

/**
 * @route   POST /api/projects/:projectId/time-entries/start
 * @desc    Inicia um novo timer (cria um TimeEntry sem endTime).
 * @access  Private
 */
router.post(
  '/projects/:projectId/time-entries/start',
  timeEntryController.startTimer
);

/**
 * @route   PATCH /api/time-entries/:id/stop
 * @desc    Para um timer em andamento (define o endTime e calcula a duração).
 * @access  Private
 */
router.patch(
  '/time-entries/:id/stop',
  timeEntryController.stopTimer
);

/**
 * @route   GET /api/projects/:projectId/time-entries
 * @desc    Lista todos os registros de tempo de um projeto.
 * @access  Private
 */
router.get(
  '/projects/:projectId/time-entries',
  timeEntryController.findAllByProject
);

/**
 * @route   DELETE /api/time-entries/:id
 * @desc    Deleta um registro de tempo específico.
 * @access  Private
 */
router.delete(
  '/time-entries/:id',
  timeEntryController.delete
);

module.exports = router; // ✅ Exporta só o router (correto)
