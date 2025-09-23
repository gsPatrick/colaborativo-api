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
        foreignKey: 'projectId',
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

      // Novas associações de produtividade
      this.hasMany(models.TimeEntry, { foreignKey: 'projectId', as: 'TimeEntries' });
      this.hasMany(models.Expense, { foreignKey: 'projectId', as: 'Expenses' });
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
    attachments: DataTypes.STRING, // Alterado para STRING para simplicidade, pode ser JSONB
    budget: DataTypes.DECIMAL(10, 2),
    platform: DataTypes.STRING,
    platformCommission: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.00
    },
    deadline: DataTypes.DATE,
    status: {
      type: DataTypes.ENUM('draft', 'in_progress', 'paused', 'completed', 'archived'),
      defaultValue: 'draft'
    },
    paymentDetails: {
      type: DataTypes.JSONB,
      defaultValue: {
        clientStatus: 'unpaid',
        clientAmountPaid: 0
      }
    },

    // Campos para detalhes técnicos
    technicalStack: {
      type: DataTypes.JSONB,
      defaultValue: [] // Ex: [{ type: 'Frontend', name: 'React', repoUrl: '...' }]
    },
    credentials: {
      type: DataTypes.JSONB,
      defaultValue: [] // Ex: [{ service: 'AWS S3', user: '...', pass: '...' }]
    },
    projectLinks: {
      type: DataTypes.JSONB,
      defaultValue: [] // Ex: [{ name: 'Figma', url: '...' }]
    }
  }, {
    sequelize,
    modelName: 'Project',
    tableName: 'projects'
  });
  return Project;
};