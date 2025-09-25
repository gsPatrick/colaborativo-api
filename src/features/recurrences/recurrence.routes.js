const express = require('express');
const router = express.Router();
const recurrenceController = require('./recurrence.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

router.post('/recurrences', recurrenceController.create);
router.get('/recurrences', recurrenceController.findAll);
router.get('/recurrences/:id', recurrenceController.findOne);
router.patch('/recurrences/:id', recurrenceController.update);
router.delete('/recurrences/:id', recurrenceController.delete);

// --- Rotas para lançamentos previstos ---
router.get('/forecast-entries', recurrenceController.findAllForecastEntries);
router.patch('/forecast-entries/:id/confirm', recurrenceController.confirmForecastEntry); // Confirma e gera transação/despesa

module.exports = router;