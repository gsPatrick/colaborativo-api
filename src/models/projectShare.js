'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectShare extends Model {
    static associate(models) {
      this.belongsTo(models.Project, { foreignKey: 'projectId' });
      this.belongsTo(models.User, { as: 'Partner', foreignKey: 'partnerId' });
    }
  }
  ProjectShare.init({
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'projects', key: 'id' }
    },
    partnerId: { // ID do parceiro com quem o projeto foi compartilhado
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    commissionType: {
      type: DataTypes.ENUM('percentage', 'fixed'),
      allowNull: false
    },
    commissionValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    permissions: {
      type: DataTypes.ENUM('read', 'edit'),
      defaultValue: 'read'
    }
  }, {
    sequelize,
    modelName: 'ProjectShare',
    tableName: 'project_shares',
    indexes: [{ unique: true, fields: ['projectId', 'partnerId'] }] // Não compartilhar o mesmo projeto duas vezes com o mesmo parceiro
  });
  return ProjectShare;
};