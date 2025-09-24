'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      // Relações de Colaboração (convites enviados e recebidos)
      this.hasMany(models.Collaboration, { as: 'SentRequests', foreignKey: 'requesterId' });
      this.hasMany(models.Collaboration, { as: 'ReceivedRequests', foreignKey: 'addresseeId' });

      // Relações de Clientes
      this.hasMany(models.Client, { as: 'OwnedClients', foreignKey: 'ownerId' });
      this.belongsToMany(models.Client, { 
        through: models.ClientShare, 
        as: 'SharedClients', 
        foreignKey: 'userId' 
      });

      // Relações de Projetos
      this.hasMany(models.Project, { as: 'OwnedProjects', foreignKey: 'ownerId' });
      this.belongsToMany(models.Project, { 
        through: models.ProjectShare, 
        as: 'PartnerProjects', 
        foreignKey: 'partnerId' 
      });
      
      // Entidades customizáveis pela conta
      this.hasMany(models.Priority, { foreignKey: 'userId' });
      this.hasMany(models.Tag, { foreignKey: 'userId' });

      // Logs de auditoria gerados pelo usuário
      this.hasMany(models.AuditLog, { foreignKey: 'userId' });

      // Novas associações de produtividade
      this.hasMany(models.TimeEntry, { foreignKey: 'userId' });
      this.hasMany(models.Expense, { foreignKey: 'userId' });
      this.hasMany(models.Platform, { foreignKey: 'userId' });
    }
  }
  User.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    label: {
      type: DataTypes.ENUM('dev', 'agency'),
      allowNull: false
    },
    
    // Dados de Pessoa Física (para ambos os tipos de conta)
    cpf: {
      type: DataTypes.STRING,
      unique: true
    },
    phone: {
      type: DataTypes.STRING,
    },

    // Dados de Pessoa Jurídica (apenas para 'agency')
    companyName: {
      type: DataTypes.STRING, // Razão Social
    },
    companyFantasyName: {
      type: DataTypes.STRING, // Nome Fantasia
    },
    companyCnpj: {
      type: DataTypes.STRING,
      unique: true
    },
    
    // Campos para Integração (eNotas)
    enotasCompanyId: DataTypes.STRING,
    enotasApiKey: DataTypes.STRING,

  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users'
  });
  return User;
};