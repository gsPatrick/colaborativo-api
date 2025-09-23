// app.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Importar bcrypt para a senha
require('dotenv').config();

const mainRouter = require('./src/routes');
const db = require('./src/models');
const { sequelize, User, Priority } = db; // Pegar o modelo User também

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
 * Função de seeding robusta:
 * 1. Procura por um usuário padrão.
 * 2. Se não existir, cria o usuário.
 * 3. Usa o ID do usuário (existente ou novo) para criar as prioridades padrão.
 */
const seedDatabase = async () => {
  try {
    // 1. Encontrar ou criar o usuário padrão
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

    const userId = user.id; // Pega o ID do usuário, seja ele novo ou existente

    // 2. Verificar e criar as prioridades para este usuário
    const count = await Priority.count({ where: { userId } });
    if (count === 0) {
      console.log(`Nenhuma prioridade encontrada para o usuário ${userId}. Criando prioridades padrão...`);
      await Priority.bulkCreate([
        { name: 'Alta', color: '#ef4444', order: 1, userId },
        { name: 'Média', color: '#f59e0b', order: 2, userId },
        { name: 'Baixa', color: '#6b7280', order: 3, userId },
      ]);
      console.log('Prioridades padrão criadas com sucesso!');
    } else {
      console.log(`Prioridades já existem para o usuário ${userId}.`);
    }
  } catch (error) {
    console.error('Erro ao semear o banco de dados:', error);
  }
};

// Sincronizar banco de dados e iniciar servidor
// Use `force: true` APENAS em desenvolvimento para recriar as tabelas
sequelize.sync({ force: false }) 
  .then(() => {
    console.log('Banco de dados sincronizado com sucesso!');
    
    // Roda a função de seeding DEPOIS de sincronizar
    seedDatabase();

    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Erro ao sincronizar banco de dados:', err);
  });