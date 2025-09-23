'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AuditLog extends Model {
    static associate(models) {
      // O log foi gerado por um usuário
      this.belongsTo(models.User, {
        foreignKey: 'userId',
      });
    }
  }
  AuditLog.init({
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    actionType: { // Ex: 'PROJECT_CREATED', 'CLIENT_SHARED', 'COMMISSION_CHANGED'
      type: DataTypes.STRING,
      allowNull: false
    },
    entityType: { // Ex: 'project', 'client', 'collaboration'
      type: DataTypes.STRING
    },
    entityId: { // ID da entidade que sofreu a ação
      type: DataTypes.INTEGER
    },
    details: { // JSONB para guardar detalhes como "de/para"
      type: DataTypes.JSONB
    }
  }, {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_logs',
    updatedAt: false, // Logs não devem ser atualizados
  });
  return AuditLog;
};