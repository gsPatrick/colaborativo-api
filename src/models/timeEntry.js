'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TimeEntry extends Model {
    static associate(models) {
      this.belongsTo(models.User, { foreignKey: 'userId' });
      this.belongsTo(models.Project, { foreignKey: 'projectId' });
    }
  }
  TimeEntry.init({
    userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
    projectId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'projects', key: 'id' } },
    startTime: { type: DataTypes.DATE, allowNull: false },
    endTime: DataTypes.DATE, // Pode ser nulo se o timer estiver rodando
    durationInMinutes: DataTypes.INTEGER, // Calculado ao parar o timer
    description: DataTypes.STRING,
  }, {
    sequelize,
    modelName: 'TimeEntry', // Este nome DEVE corresponder ao que é usado nas associações (models.TimeEntry)
    tableName: 'time_entries',
  });
  return TimeEntry;
};