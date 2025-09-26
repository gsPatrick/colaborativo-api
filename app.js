// app.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Importar bcrypt para a senha
require('dotenv').config();
const recurrenceService = require('./src/features/recurrences/recurrence.service'); // Importar serviço de recorrência

const mainRouter = require('./src/routes');
const db = require('./src/models');
// CORREÇÃO: Importar o operador 'fn' e 'col' do sequelize para a nova função
const { sequelize, User, Priority, Sequelize } = db; 

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', mainRouter);

app.get('/', (req, res) => {
  res.status(200).json({ status: 'API is running' });
});

const PORT = process.env.PORT || 5001;

/**
 * Função para criar o usuário de teste padrão, se ele não existir.
 * Isso é útil para ambientes de desenvolvimento e testes iniciais.
 */
const seedTestUser = async () => {
  try {
    const [user, created] = await User.findOrCreate({
      where: { email: 'teste@email.com' },
      defaults: {
        name: 'Usuário Teste',
        password: bcrypt.hashSync('123456', 10), // Senha padrão criptografada
        label: 'dev'
      }
    });

    if (created) {
      console.log('Usuário de teste padrão criado com sucesso!');
    }
  } catch (error) {
    console.error('Erro ao semear o usuário de teste:', error);
  }
};

/**
 * --- NOVA FUNÇÃO ---
 * Garante que TODOS os usuários existentes que não possuem prioridades
 * recebam as prioridades padrão. É mais eficiente e robusta.
 */
const seedPrioritiesForAllUsers = async () => {
  try {
    console.log('Iniciando verificação de prioridades para todos os usuários...');

    // 1. Busca os IDs de todos os usuários existentes.
    const allUsers = await User.findAll({ attributes: ['id'], raw: true });
    if (allUsers.length === 0) {
      console.log('Nenhum usuário no banco. Pulando criação de prioridades.');
      return;
    }
    const allUserIds = allUsers.map(u => u.id);

    // 2. Busca de forma eficiente os IDs de usuários que JÁ TÊM prioridades.
    const usersWithPrioritiesResult = await Priority.findAll({
      attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('userId')), 'userId']],
      raw: true
    });
    const usersWithPrioritiesIds = new Set(usersWithPrioritiesResult.map(p => p.userId));

    // 3. Filtra para encontrar apenas os usuários que PRECISAM de prioridades.
    const usersWhoNeedPriorities = allUserIds.filter(id => !usersWithPrioritiesIds.has(id));

    if (usersWhoNeedPriorities.length === 0) {
      console.log('Todos os usuários já possuem prioridades.');
      return;
    }

    console.log(`Encontrados ${usersWhoNeedPriorities.length} usuários sem prioridades. Criando agora...`);

    // 4. Prepara a lista de prioridades para serem criadas em massa (bulkCreate).
    const prioritiesToCreate = [];
    const defaultPriorities = [
      { name: 'Alta', color: '#ef4444', order: 1 },
      { name: 'Média', color: '#f59e0b', order: 2 },
      { name: 'Baixa', color: '#6b7280', order: 3 },
    ];

    // Adiciona o conjunto de prioridades padrão para cada usuário que precisa.
    usersWhoNeedPriorities.forEach(userId => {
      defaultPriorities.forEach(priority => {
        prioritiesToCreate.push({ ...priority, userId });
      });
    });

    // 5. Executa a criação em massa, que é muito mais performática.
    await Priority.bulkCreate(prioritiesToCreate);

    console.log(`Prioridades padrão criadas com sucesso para ${usersWhoNeedPriorities.length} usuários.`);

  } catch (error) {
    console.error('Erro crítico ao semear prioridades para todos os usuários:', error);
  }
};


// Sincronizar banco de dados e iniciar servidor
// Use `force: true` APENAS em desenvolvimento para recriar as tabelas
sequelize.sync({ force: false }) 
  .then(async () => {
    console.log('Banco de dados sincronizado com sucesso!');
    
    // Roda as funções de seeding (criação de dados iniciais)
    await seedTestUser();
    await seedPrioritiesForAllUsers(); // <-- NOVA CHAMADA AQUI

    // --- Gerar lançamentos previstos iniciais ---
    await recurrenceService.generateInitialForecasts();

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erro ao sincronizar banco de dados:', err);
  });