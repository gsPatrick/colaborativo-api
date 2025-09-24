'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Platform extends Model {
    static associate(models) {
      // Uma plataforma pertence a um usuário (customizável por usuário)
      this.belongsTo(models.User, { foreignKey: 'userId' });
      // Uma plataforma pode ter muitos projetos associados
      this.hasMany(models.Project, { foreignKey: 'platformId' });
    }
  }
  Platform.init({
    userId: { // ID do usuário que criou esta plataforma customizada
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    defaultCommissionPercent: { // Comissão padrão dessa plataforma
      type: DataTypes.DECIMAL(5, 2), // Ex: 10.00 para 10%
      defaultValue: 0.00
    },
    logoUrl: DataTypes.STRING, // URL do logo da plataforma
  }, {
    sequelize,
    modelName: 'Platform',
    tableName: 'platforms',
    indexes: [{ unique: true, fields: ['userId', 'name'] }] // Nome único por usuário
  });
  return Platform;
};