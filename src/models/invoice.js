'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Invoice extends Model {
    static associate(models) {
      this.belongsTo(models.Project, { foreignKey: 'projectId' });
      this.belongsTo(models.User, { foreignKey: 'userId' });
    }
  }
  Invoice.init({
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' } },
    enotasId: { type: DataTypes.STRING, allowNull: false, unique: true }, // ID retornado pela API do eNotas
    status: DataTypes.STRING, // Ex: 'autorizada', 'processando', 'cancelada'
    number: DataTypes.STRING,
    serie: DataTypes.STRING,
    pdfUrl: DataTypes.STRING,
    xmlUrl: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'Invoice',
    tableName: 'invoices',
  });
  return Invoice;
};