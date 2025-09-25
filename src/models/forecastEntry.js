'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ForecastEntry extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'userId' });
      this.belongsTo(models.Recurrence, { foreignKey: 'recurrenceId' });
      this.belongsTo(models.Client, { foreignKey: 'clientId', allowNull: true });
      this.belongsTo(models.Project, { foreignKey: 'projectId', allowNull: true });
      // Um lançamento previsto pode ser confirmado como uma transação ou despesa
      this.hasOne(models.Transaction, { foreignKey: 'forecastEntryId', as: 'ConfirmedTransaction' });
      this.hasOne(models.Expense, { foreignKey: 'forecastEntryId', as: 'ConfirmedExpense' });
    }
  }
  ForecastEntry.init({
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    recurrenceId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'recurrences', key: 'id' } },
    clientId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'clients', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'projects', key: 'id' } },
    
    type: { type: DataTypes.ENUM('revenue', 'expense'), allowNull: false },
    description: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    
    dueDate: { type: DataTypes.DATEONLY, allowNull: false }, // Data prevista de ocorrência
    status: { // 'pending', 'confirmed', 'missed' (não foi confirmado e a data passou)
      type: DataTypes.ENUM('pending', 'confirmed', 'missed'),
      defaultValue: 'pending'
    },
  }, {
    sequelize,
    modelName: 'ForecastEntry',
    tableName: 'forecast_entries',
  });
  return ForecastEntry;
};