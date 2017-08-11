import { ProgramSymbolTable } from '@glimmer/interfaces';
import { VMHandle } from '@glimmer/opcode-compiler';
import { Template } from './template';

export class PartialDefinition {
  constructor(
    public name: string, // for debugging
    private template: Template
  ) {
  }

  getPartial(): { symbolTable: ProgramSymbolTable, handle: VMHandle } {
    let partial = this.template.asPartial();
    let handle = partial.compile();
    return { symbolTable: partial.symbolTable, handle };
  }
}
