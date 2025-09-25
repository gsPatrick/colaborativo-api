const express = require('express');
const router = express.Router();

// Importações de rotas existentes
const userRoutes = require('../features/user/user.routes');
const collaborationRoutes = require('../features/collaboration/collaboration.routes');
const clientRoutes = require('../features/client/client.routes');
const projectRoutes = require('../features/project/project.routes');
const priorityRoutes = require('../features/priority/priority.routes');
const tagRoutes = require('../features/tag/tag.routes');
const dashboardRoutes = require('../features/dashboard/dashboard.routes');
const invoiceRoutes = require('../features/invoice/invoice.routes');
const expenseRoutes = require('../features/expenses/expense.routes');
const transactionRoutes = require ('../features/transaction/transaction.routes')
const platformRoutes = require('../features/platform/platform.routes'); // <-- NOVO
const recurrenceRoutes = require('../features/recurrences/recurrence.routes'); // <-- NOVO: Rotas de recorrência/forecast

// --- CORREÇÃO AQUI ---
// Garante que o caminho para os novos arquivos de rota esteja correto
const timeEntryRoutes = require('../features/time-entries/timeEntry.routes'); 

// --- REGISTRO DAS ROTAS ---

// Rotas de autenticação e gerenciamento de perfil de usuário
router.use('/users', userRoutes);
// Rotas para gerenciar colaborações
router.use('/collaborations', collaborationRoutes);
// Rotas para gerenciar clientes
router.use('/clients', clientRoutes);
// Rotas para gerenciar projetos
router.use('/projects', projectRoutes);
// Rotas para gerenciar prioridades customizadas
router.use('/priorities', priorityRoutes);
// Rotas para gerenciar tags customizadas
router.use('/tags', tagRoutes);
// Rotas para obter dados consolidados do dashboard
router.use('/dashboard', dashboardRoutes);
// Rotas para faturamento
router.use('/', invoiceRoutes);
// Rotas para despesas
router.use('/', expenseRoutes);
// Rotas para controle de tempo
router.use('/', timeEntryRoutes);

router.use('/', transactionRoutes); // <-- NOVO (use '/' pois as rotas já são específicas)
router.use('/', platformRoutes); // <-- NOVO
router.use('/', recurrenceRoutes); // <-- NOVO


module.exports = router;