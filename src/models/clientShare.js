'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ClientShare extends Model {
    static associate(models) {
      this.belongsTo(models.Client, { foreignKey: 'clientId' });
      this.belongsTo(models.User, { foreignKey: 'userId' });
    }
  }
  ClientShare.init({
    clientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'clients', key: 'id' }
    },
    userId: { // ID do usuário com quem o cliente foi compartilhado
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'users', key: 'id' }
    },
    // Futuramente, pode ter permissões aqui (ex: 'read-only', 'full-access')
  }, {
    sequelize,
    modelName: 'ClientShare',
    tableName: 'client_shares',
    indexes: [{ unique: true, fields: ['clientId', 'userId'] }] // Não compartilhar o mesmo cliente duas vezes com o mesmo usuário
  });
  return ClientShare;
};