const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// Aplica o middleware de autenticação a TODAS as rotas deste arquivo
router.use(authMiddleware);

// Rota principal para obter os dados do dashboard
// Ex: GET /api/dashboard?period=month
router.get('/', dashboardController.getDashboard);

module.exports = router;