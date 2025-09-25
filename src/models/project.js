'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Project extends Model {
    static associate(models) {
      // Um projeto pertence a uma conta "dona"
      this.belongsTo(models.User, {
        as: 'Owner',
        foreignKey: 'ownerId',
      });
      
      // Um projeto pertence a um cliente
      this.belongsTo(models.Client, {
        foreignKey: 'clientId',
      });
      
      // Um projeto pertence a uma prioridade
      this.belongsTo(models.Priority, {
        foreignKey: 'priorityId',
      });

      // Um projeto pode ser compartilhado com vários usuários através da tabela ProjectShare
      this.belongsToMany(models.User, { 
        through: models.ProjectShare, 
        as: 'Partners', 
        foreignKey: 'projectId' 
      });
      // Associação direta com ProjectShare para includes mais fáceis e robustos
      this.hasMany(models.ProjectShare, { 
        foreignKey: 'projectId', 
        as: 'ProjectShares' 
      });

      // Um projeto pode ter várias tags
      this.belongsToMany(models.Tag, {
        through: models.ProjectTag,
        foreignKey: 'projectId',
      });

      // Um projeto pode ter várias transações (pagamentos)
      this.hasMany(models.Transaction, {
        foreignKey: 'projectId',
        as: 'Transactions'
      });

      // Associações de produtividade
      this.hasMany(models.TimeEntry, { foreignKey: 'projectId', as: 'TimeEntries' });
      this.hasMany(models.Expense, { foreignKey: 'projectId', as: 'Expenses' });
        this.hasMany(models.Recurrence, { foreignKey: 'projectId' }); // Uma recorrência pode ser ligada a um projeto
  this.hasMany(models.ForecastEntry, { foreignKey: 'projectId' });

      // Associação com a plataforma (ex: Workana, 99Freelas)
      this.belongsTo(models.Platform, { foreignKey: 'platformId', as: 'AssociatedPlatform' });
    }
  }
  Project.init({
    ownerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    clientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'clients', key: 'id' }
    },
    priorityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'priorities', key: 'id' }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    description: DataTypes.TEXT,
    briefing: DataTypes.TEXT,
    notes: DataTypes.TEXT,
    // attachments pode ser uma URL ou uma string JSON de URLs
    attachments: DataTypes.STRING, 
    budget: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    
    // --- CAMPOS PARA GERENCIAMENTO DE COMISSÕES E PLATAFORMA ---
    platformId: { // Liga o projeto a uma plataforma customizada (se aplicável)
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'platforms', key: 'id' }
    },
    platformCommissionPercent: { // % de comissão da plataforma sobre o budget
      type: DataTypes.DECIMAL(5, 2), // Ex: 10.00 para 10%
      defaultValue: 0.00
    },
    ownerCommissionType: { // Tipo de comissão do DONO (se o projeto tiver parceiros)
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: true // Nulo se for projeto solo
    },
    ownerCommissionValue: { // Valor da comissão do DONO
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },

    deadline: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('draft', 'in_progress', 'paused', 'completed', 'archived'),
      defaultValue: 'draft'
    },
    
    // --- paymentDetails REESTRUTURADO PARA PAGAMENTO INDIVIDUAL ---
    // Armazena o status de pagamento do cliente e o quanto o dono já recebeu
    paymentDetails: {
      type: DataTypes.JSONB,
      defaultValue: {
        client: { status: 'unpaid', amountPaid: 0 }, // Status do pagamento do CLIENTE pelo valor total do projeto
        owner: { status: 'unpaid', amountReceived: 0 }, // O quanto o DONO já recebeu do cliente (sem repassar aos parceiros)
        // partners: {} // Esta parte não é persistida no Project, mas sim em ProjectShare.amountPaid
      }
    },

    // Campos para detalhes técnicos (documentação interna)
    technicalStack: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    credentials: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    projectLinks: {
      type: DataTypes.JSONB,
      defaultValue: []
    }
  }, {
    sequelize,
    modelName: 'Project',
    tableName: 'projects'
  });
  return Project;
};