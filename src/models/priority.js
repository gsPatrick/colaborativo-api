'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Priority extends Model {
    static associate(models) {
      // Uma prioridade pertence a uma conta de usuário (customizável por conta)
      this.belongsTo(models.User, {
        foreignKey: 'userId',
      });
      // Uma prioridade pode estar em vários projetos
      this.hasMany(models.Project, {
        foreignKey: 'priorityId',
      });
    }
  }
  Priority.init({
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    color: { // Para o frontend exibir cores (ex: '#FF0000')
      type: DataTypes.STRING,
      defaultValue: '#FFFFFF'
    },
    order: { // Para permitir que o usuário ordene suas prioridades
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'Priority',
    tableName: 'priorities',
  });
  return Priority;
};