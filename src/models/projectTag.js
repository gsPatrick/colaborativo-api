'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProjectTag extends Model {
    static associate(models) {
      this.belongsTo(models.Project, { foreignKey: 'projectId' });
      this.belongsTo(models.Tag, { foreignKey: 'tagId' });
    }
  }
  ProjectTag.init({
    projectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'projects', key: 'id' }
    },
    tagId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'tags', key: 'id' }
    }
  }, {
    sequelize,
    modelName: 'ProjectTag',
    tableName: 'project_tags',
    indexes: [{ unique: true, fields: ['projectId', 'tagId'] }]
  });
  return ProjectTag;
};