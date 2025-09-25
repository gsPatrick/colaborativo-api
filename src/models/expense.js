'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Expense extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'userId' });
      this.belongsTo(models.Project, { foreignKey: 'projectId' }); // Associação opcional
    }
  }
  Expense.init({
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Se for nulo, é uma despesa geral do negócio
      references: { model: 'projects', key: 'id' }
    },
    description: { type: DataTypes.STRING, allowNull: false },
    category: DataTypes.STRING, // Ex: "Software", "Hospedagem", "Marketing"
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
    receiptUrl: DataTypes.STRING, // Link da imagem do comprovante
        // --- NOVO CAMPO ---
    forecastEntryId: { // Liga a despesa a um lançamento previsto
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'forecast_entries', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'Expense', // Este nome DEVE corresponder ao que é usado nas associações (models.Expense)
    tableName: 'expenses',
  });
  return Expense;
};