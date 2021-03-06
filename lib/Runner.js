const { Boards }    = require('boards');
const { Homefront } = require('homefront');
const path          = require('path');
const boards        = new Boards({ discovery: false });

class Runner {
  constructor(config) {
    this.boards = new Boards({ discovery: false });
    this.config = config;
  }

  run(task, parameters) {
    let instructions = task;

    if (typeof task === 'string') {
      if (!this.config.tasks[task]) {
        return Promise.reject(new Error(`Instructions for task "${task}" not found.`));
      }

      instructions = this.config.tasks[task];
    }

    if (!instructions) {
      return Promise.reject(new Error(`Invalid instructions provided.`));
    }

    if (!Array.isArray(instructions)) {
      instructions = [instructions];
    }

    let previousTask = null;

    return Promise.all(instructions.map(instruction => {
      let runner;

      if (previousTask) {
        runner       = previousTask.then(() => this.runTask(instruction, parameters));
        previousTask = null;
      } else {
        runner = this.runTask(instruction, parameters);
      }

      if (instruction.sync) {
        previousTask = runner;
      }

      return runner;
    }));
  }

  prepareParams(method, params) {
    const preparedParams = method(params);

    if (typeof preparedParams === 'object') {
      return preparedParams;
    }

    return params;
  }

  runTask(instruction, parameters) {
    // Prepare for step. Copy parameters to not affect other tasks.
    if (typeof instruction.prepare === 'function') {
      parameters = this.prepareParams(instruction.prepare, Homefront.merge({}, parameters));
    }

    // Allow dynamic tasks to be supplied.
    if (typeof instruction.dynamicTask === 'function') {
      return Promise.resolve(instruction.dynamicTask(parameters)).then(tasks => {
        this.run(tasks, parameters);
      });
    }

    if (typeof instruction.definedTask !== 'undefined') {
      if (typeof instruction.definedTask !== 'string') {
        throw new Error(`definedTask must be a string. Got ${typeof instruction.definedTask}.`);
      }

      if (instruction.isolated && typeof instruction.prepare !== 'function') {
        parameters = Homefront.merge({}, parameters);
      }

      return this.run(instruction.definedTask, parameters);
    }

    if (typeof instruction.task === 'function') {
      return instruction.task(parameters, boards);
    }

    if (typeof this[instruction.task] !== 'function') {
      throw new Error(`Invalid task "${instruction.task}" supplied`);
    }

    return this[instruction.task](instruction, parameters);
  }

  modify(instruction, parameters) {
    return this.boards.generate('ModificationGenerator', Object.assign({}, parameters, {
      sourceDirectory: this.config.appRoot,
      targetDirectory: this.config.appRoot,
      sourceFile     : this.getTarget(instruction.target, parameters),
      modify         : { patch: instruction.patch }
    }));
  }

  generate(instruction, parameters) {
    const parsed = path.parse(this.getTarget(instruction.target, parameters));

    return boards.generate('TemplateGenerator', Object.assign({}, parameters, {
      sourceFile     : instruction.template,
      targetFile     : parsed.base,
      sourceDirectory: this.config.templateRoot,
      targetDirectory: path.join(this.config.appRoot, parsed.dir)
    }));
  }

  getTarget(target, parameters) {
    if (typeof target === 'function') {
      return target(parameters);
    }

    return target
      .replace(/{{pascalCased}}/g, parameters.pascalCased)
      .replace(/{{upperCased}}/g, parameters.upperCased)
      .replace(/{{name}}/g, parameters.name);
  }
}

module.exports.Runner = Runner;
