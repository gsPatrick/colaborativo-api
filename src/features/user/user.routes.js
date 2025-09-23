const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const authMiddleware = require('../../middlewares/auth.middleware');

// --- Rotas Públicas ---
// Qualquer um pode se registrar ou tentar fazer login

// Rota para criar (registrar) um novo usuário
router.post('/register', userController.register);

// Rota para autenticar (login) um usuário
router.post('/login', userController.login);


// --- Rotas Protegidas ---
// A partir daqui, todas as rotas precisam de um token JWT válido

// Rota para buscar os dados do próprio usuário logado
// O middleware 'authMiddleware' será executado antes do 'userController.getMe'
router.get('/me', authMiddleware, userController.getMe);


// Você pode adicionar mais rotas protegidas aqui, como:
// router.patch('/me', authMiddleware, userController.updateProfile);
// router.delete('/me', authMiddleware, userController.deleteAccount);

module.exports = router;