'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Recurrence extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'userId' });
      this.belongsTo(models.Client, { foreignKey: 'clientId', allowNull: true }); // Opcional, se a recorrência não for ligada a um cliente
      this.belongsTo(models.Project, { foreignKey: 'projectId', allowNull: true }); // Opcional, se for uma despesa geral recorrente
      // Uma recorrência pode gerar muitos lançamentos previstos
      this.hasMany(models.ForecastEntry, { foreignKey: 'recurrenceId', as: 'ForecastEntries' });
    }
  }
  Recurrence.init({
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    clientId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'clients', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'projects', key: 'id' } },
    
    type: { // 'revenue' ou 'expense'
      type: DataTypes.ENUM('revenue', 'expense'),
      allowNull: false
    },
    description: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    
    // Configuração de recorrência
    frequency: { // 'monthly', 'quarterly', 'annually'
      type: DataTypes.ENUM('monthly', 'quarterly', 'annually'),
      allowNull: false
    },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true }, // Fim da recorrência (opcional)
    
    // Detalhes extras para receita recorrente (ex: pacote de horas)
    associatedHours: { type: DataTypes.DECIMAL(6, 2), defaultValue: 0.00 }, // Horas incluídas no pacote

  }, {
    sequelize,
    modelName: 'Recurrence',
    tableName: 'recurrences',
  });
  return Recurrence;
};