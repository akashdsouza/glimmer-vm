import EmberObject from "@glimmer/object";
import { CLASS_META, setProperty as set, UpdatableReference } from '@glimmer/object-reference';
import {
  BasicComponent,
  classes,
  EmberishCurlyComponent,
  EmberishGlimmerComponent,
  equalsElement,
  equalTokens,
  inspectHooks,
  regex,
  stripTight,
  TestDynamicScope,
  TestEnvironment,
} from "@glimmer/test-helpers";
import { assign } from "@glimmer/util";
import { RenderResult, Template } from '../index';
import { assert } from './support';

export class EmberishRootView extends EmberObject {
  public element: Element;

  protected template: Template;
  protected result: RenderResult;

  private parent: Element;

  constructor(
    protected env: TestEnvironment,
    template: string,
    context?: Object
  ) {
    super(context);
    this.template = env.compile(template);
  }

  appendTo(selector: string) {
    let element = this.parent = document.querySelector(selector)!;
    let self = new UpdatableReference(this);
    let templateIterator = this.template.renderLayout({ env: this.env, self, cursor: { element, nextSibling: null }, dynamicScope: new TestDynamicScope() });

    let result;
    do {
      result = templateIterator.next();
    } while (!result.done);

    this.result = result.value!;

    this.element = element.firstElementChild!;
  }

  rerender(context: Object | null = null) {
    if (context) {
      this.setProperties(context);
    }

    this.env.begin();
    this.result.rerender();
    this.env.commit();

    this.element = this.parent.firstElementChild!;
  }

  destroy() {
    super.destroy();
    if (this.result) {
      this.result.destroy();
    }
  }
}

EmberishRootView[CLASS_META].seal();

let view: EmberishRootView, env: TestEnvironment;

function module(name: string) {
  QUnit.module(`[components] ${name}`, {
    beforeEach() {
      env = new TestEnvironment();
    }
  });
}

export function appendViewFor(template: string, context: Object = {}) {
  view = new EmberishRootView(env, template, context);

  env.begin();
  view.appendTo('#qunit-fixture');
  env.commit();

  return view;
}

export function assertAppended(content: string) {
  equalTokens((<HTMLElement>document.querySelector('#qunit-fixture')), content);
}

function assertText(expected: string) {
  let rawText = (document.querySelector('#qunit-fixture') as HTMLElement).innerText;
  let text = rawText.split(/[\r\n]/g).map((part) => {
    let p = part.replace(/\s+/g, ' ');
    return p.trim();
  }).filter((part) => part !== '').join(' ');
  QUnit.assert.strictEqual(text, expected, `#qunit-fixture content should be: \`${expected}\``);
}

function assertFired(component: EmberishGlimmerComponent, name: string, count = 1) {
  let hooks = component['hooks'];

  if (!hooks) {
    throw new TypeError("Not hooked: " + component);
  }

  if (name in hooks) {
    assert.strictEqual(hooks[name], count, `The ${name} hook fired ${count} ${count === 1 ? 'time' : 'times'}`);
  } else {
    assert.ok(false, `The ${name} hook fired`);
  }
}

function assertEmberishElement(tagName: string, attrs: Object, contents: string): void;
function assertEmberishElement(tagName: string, attrs: Object): void;
function assertEmberishElement(tagName: string, contents: string): void;
function assertEmberishElement(tagName: string): void;
function assertEmberishElement(...args: any[]): void {
  let tagName, attrs, contents;
  if (args.length === 2) {
    if (typeof args[1] === 'string')[tagName, attrs, contents] = [args[0], {}, args[1]];
    else[tagName, attrs, contents] = [args[0], args[1], null];
  } else if (args.length === 1) {
    [tagName, attrs, contents] = [args[0], {}, null];
  } else {
    [tagName, attrs, contents] = args;
  }

  let fullAttrs = assign({ class: classes('ember-view'), id: regex(/^ember\d*$/) }, attrs);
  equalsElement(view.element, tagName, fullAttrs, contents);
}

export function assertElementIsEmberishElement(element: Element | null, tagName: string, attrs: Object, contents: string): void;
export function assertElementIsEmberishElement(element: Element | null, tagName: string, attrs: Object): void;
export function assertElementIsEmberishElement(element: Element | null, tagName: string, contents: string): void;
export function assertElementIsEmberishElement(element: Element | null, tagName: string): void;
export function assertElementIsEmberishElement(element: Element | null, ...args: any[]): void {
  let tagName, attrs, contents;
  if (args.length === 2) {
    if (typeof args[1] === 'string')[tagName, attrs, contents] = [args[0], {}, args[1]];
    else[tagName, attrs, contents] = [args[0], args[1], null];
  } else if (args.length === 1) {
    [tagName, attrs, contents] = [args[0], {}, null];
  } else {
    [tagName, attrs, contents] = args;
  }

  let fullAttrs = assign({ class: classes('ember-view'), id: regex(/^ember\d*$/) }, attrs);
  equalsElement(element, tagName, fullAttrs, contents);
}

function rerender() {
  view.rerender();
}

module('Manager#create - hasBlock');

QUnit.test('when no block present', () => {
  class FooBar extends EmberishCurlyComponent {
    tagName = 'div';
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, `{{HAS_BLOCK}}`);

  appendViewFor(`{{foo-bar}}`);

  assertEmberishElement('div', {}, `false`);
});

QUnit.test('when block present', () => {
  class FooBar extends EmberishCurlyComponent {
    tagName = 'div';
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, `{{HAS_BLOCK}}`);

  appendViewFor(`{{#foo-bar}}{{/foo-bar}}`);

  assertEmberishElement('div', {}, `true`);
});

module("Components - curlies - dynamic component");

QUnit.test('initially missing, then present, then missing', () => {
  env.registerBasicComponent('FooBar', BasicComponent, `<p>{{@arg1}}</p>`);

  appendViewFor(
    stripTight`
      <div>
        {{component something arg1="hello"}}
      </div>`,
    {
      something: undefined
    }
  );

  equalsElement(view.element, 'div', {}, '<!---->');

  set(view, 'something', 'FooBar');
  rerender();

  equalsElement(view.element, 'div', {}, '<p>hello</p>');

  set(view, 'something', undefined);
  rerender();

  equalsElement(view.element, 'div', {}, '<!---->');
});

QUnit.test('initially present, then missing, then present', () => {
  env.registerBasicComponent('FooBar', BasicComponent, `<p>foo bar baz</p>`);

  appendViewFor(
    stripTight`
      <div>
        {{component something}}
      </div>`,
    {
      something: "FooBar"
    }
  );

  equalsElement(view.element, 'div', {}, '<p>foo bar baz</p>');

  set(view, 'something', undefined);
  rerender();

  equalsElement(view.element, 'div', {}, '<!---->');

  set(view, 'something', 'FooBar');
  rerender();

  equalsElement(view.element, 'div', {}, '<p>foo bar baz</p>');
});

module("Components - curlies - dynamic customizations");

QUnit.test('dynamic tagName', () => {
  class FooBar extends EmberishCurlyComponent {
    tagName = 'aside';
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, `Hello. It's me.`);

  appendViewFor(`{{foo-bar}}`);
  assertEmberishElement('aside', {}, `Hello. It's me.`);

  rerender();

  assertEmberishElement('aside', {}, `Hello. It's me.`);
});

QUnit.test('dynamic tagless component', () => {
  class FooBar extends EmberishCurlyComponent {
    tagName = '';
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, `Michael Jordan says "Go Tagless"`);

  appendViewFor(`{{foo-bar}}`);
  assertAppended('Michael Jordan says "Go Tagless"');

  rerender();

  assertAppended('Michael Jordan says "Go Tagless"');
});

QUnit.test('dynamic attribute bindings', assert => {
  let fooBarInstance: FooBar | undefined;

  class FooBar extends EmberishCurlyComponent {
    attributeBindings = ['style'];
    style: string | null = null;

    constructor(attrs: any) {
      super(attrs);
      this.style = 'color: red;';
      fooBarInstance = this;
    }
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, `Hello. It's me.`);

  appendViewFor(`{{foo-bar}}`);
  assertEmberishElement('div', { 'style': 'color: red;' }, `Hello. It's me.`);

  rerender();

  assert.ok(fooBarInstance, 'expected foo-bar to be set');

  if (fooBarInstance === undefined) { return; }

  assertEmberishElement('div', { 'style': 'color: red;' }, `Hello. It's me.`);

  fooBarInstance.style = 'color: green;';
  rerender();

  assertEmberishElement('div', { 'style': 'color: green;' }, `Hello. It's me.`);

  fooBarInstance.style = null;
  rerender();

  assertEmberishElement('div', {}, `Hello. It's me.`);

  fooBarInstance.style = 'color: red;';
  rerender();

  assertEmberishElement('div', { 'style': 'color: red;' }, `Hello. It's me.`);
});

module("Components - generic - attrs");

QUnit.test('using @value from emberish curly component', () => {
  class FooBar extends EmberishCurlyComponent {
    static positionalParams = ['foo'];
    tagName = 'div';
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, `{{@blah}}`);

  appendViewFor(`{{foo-bar first blah="derp"}}`);

  assertEmberishElement('div', {}, `derp`);
});

module("Components - integration - scope");

QUnit.test('correct scope - accessing local variable in yielded block (glimmer component)', () => {
  class FooBar extends BasicComponent { }

  env.registerBasicComponent('FooBar', FooBar, `<div>[Layout: {{zomg}}][Layout: {{lol}}][Layout: {{@foo}}]{{yield}}</div>`);

  appendViewFor(
    stripTight`
      <div>
        [Outside: {{zomg}}]
        {{#with zomg as |lol|}}
          [Inside: {{zomg}}]
          [Inside: {{lol}}]
          <FooBar @foo={{zomg}}>
            [Block: {{zomg}}]
            [Block: {{lol}}]
          </FooBar>
        {{/with}}
      </div>`,
    { zomg: "zomg" }
  );

  equalsElement(view.element, 'div', {},
    stripTight`
        [Outside: zomg]
        [Inside: zomg]
        [Inside: zomg]
        <div>
          [Layout: ]
          [Layout: ]
          [Layout: zomg]
          [Block: zomg]
          [Block: zomg]
        </div>`
  );
});

QUnit.test('correct scope - accessing local variable in yielded block (curly component)', () => {
  class FooBar extends EmberishCurlyComponent {
    public tagName = '';
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, `[Layout: {{zomg}}][Layout: {{lol}}][Layout: {{foo}}]{{yield}}`);

  appendViewFor(
    stripTight`
      <div>
        [Outside: {{zomg}}]
        {{#with zomg as |lol|}}
          [Inside: {{zomg}}]
          [Inside: {{lol}}]
          {{#foo-bar foo=zomg}}
            [Block: {{zomg}}]
            [Block: {{lol}}]
          {{/foo-bar}}
        {{/with}}
      </div>`,
    { zomg: "zomg" }
  );

  equalsElement(view.element, 'div', {},
    stripTight`
        [Outside: zomg]
        [Inside: zomg]
        [Inside: zomg]
        [Layout: ]
        [Layout: ]
        [Layout: zomg]
        [Block: zomg]
        [Block: zomg]`
  );
});

QUnit.test('correct scope - caller self can be threaded through (curly component)', () => {
  // demonstrates ability for Ember to know the target object of curly component actions
  class Base extends EmberishCurlyComponent {
    public tagName = '';
  }
  class FooBar extends Base {
    public name = 'foo-bar';
  }

  class QuxDerp extends Base {
    public name = 'qux-derp';
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, stripTight`
    [Name: {{name}} | Target: {{targetObject.name}}]
    {{#qux-derp}}
      [Name: {{name}} | Target: {{targetObject.name}}]
    {{/qux-derp}}
    [Name: {{name}} | Target: {{targetObject.name}}]
  `);

  env.registerEmberishCurlyComponent('qux-derp', QuxDerp, `[Name: {{name}} | Target: {{targetObject.name}}]{{yield}}`);

  appendViewFor(`<div>{{foo-bar}}</div>`, {
    name: 'outer-scope'
  });

  equalsElement(view.element, 'div', {},
    stripTight`
        [Name: foo-bar | Target: outer-scope]
        [Name: qux-derp | Target: foo-bar]
        [Name: foo-bar | Target: outer-scope]
        [Name: foo-bar | Target: outer-scope]
        `
  );
});

QUnit.test('`false` class name do not render', assert => {
  appendViewFor('<div class={{isFalse}}>FALSE</div>', { isFalse: false });
  assert.strictEqual(view.element.getAttribute('class'), null);
  assert.strictEqual(view.element.className, '');
});

QUnit.test('`null` class name do not render', assert => {
  appendViewFor('<div class={{isNull}}>NULL</div>', { isNull: null });
  assert.strictEqual(view.element.getAttribute('class'), null);
  assert.strictEqual(view.element.className, '');
});

QUnit.test('`undefined` class name do not render', assert => {
  appendViewFor('<div class={{isUndefined}}>UNDEFINED</div>', { isUndefined: undefined });
  assert.strictEqual(view.element.getAttribute('class'), null);
  assert.strictEqual(view.element.className, '');
});

QUnit.test('`0` class names do render', assert => {
  appendViewFor('<div class={{isZero}}>ZERO</div>', { isZero: 0 });
  assert.strictEqual(view.element.getAttribute('class'), '0');
  assert.strictEqual(view.element.className, '0');
});

QUnit.test('component with slashed name', assert => {
  let SampleComponent = EmberishCurlyComponent.extend();

  env.registerEmberishCurlyComponent('fizz-bar/baz-bar', SampleComponent as any, '{{@hey}}');

  appendViewFor('{{fizz-bar/baz-bar hey="hello"}}');

  assert.equal(view.element.textContent, 'hello');
});

QUnit.test('correct scope - simple', () => {
  env.registerBasicComponent('SubItem', BasicComponent,
    `<p>{{@name}}</p>`
  );

  let subitems = [{ id: 0 }, { id: 1 }, { id: 42 }];

  appendViewFor(
    stripTight`
      <div>
        {{#each items key="id" as |item|}}
          <SubItem @name={{item.id}} />
        {{/each}}
      </div>`
    , { items: subitems });

  equalsElement(view.element, 'div', {}, '<p>0</p><p>1</p><p>42</p>');
});

QUnit.test('correct scope - self lookup inside #each', () => {
  env.registerBasicComponent('SubItem', BasicComponent,
    `<p>{{@name}}</p>`
  );

  let subitems = [{ id: 0 }, { id: 1 }, { id: 42 }];

  appendViewFor(
    stripTight`
      <div>
        {{#each items key="id" as |item|}}
          <SubItem @name={{this.id}} />
          <SubItem @name={{id}} />
          <SubItem @name={{item.id}} />
        {{/each}}
      </div>`
    , { items: subitems, id: '(self)' });

  equalsElement(view.element, 'div', {}, stripTight`
    <p>(self)</p><p>(self)</p><p>0</p>
    <p>(self)</p><p>(self)</p><p>1</p>
    <p>(self)</p><p>(self)</p><p>42</p>`);
});

QUnit.test('correct scope - complex', () => {
  env.registerBasicComponent('SubItem', BasicComponent,
    `<p>{{@name}}</p>`
  );

  env.registerBasicComponent('MyItem', BasicComponent,
    stripTight`
      <aside>{{@item.id}}:
        {{#if @item.visible}}
          {{#each @item.subitems key="id" as |subitem|}}
             <SubItem @name={{subitem.id}} />
          {{/each}}
        {{/if}}
      </aside>`);

  let itemId = 0;

  let items = [];

  for (let i = 0; i < 3; i++) {
    let subitems = [];
    let subitemId = 0;

    for (let j = 0; j < 2; j++) {
      subitems.push({
        id: `${itemId}.${subitemId++}`
      });
    }

    items.push({
      id: String(itemId++),
      visible: i % 2 === 0,
      subitems
    });
  }

  appendViewFor(
    stripTight`
        <article>{{#each items key="id" as |item|}}
          <MyItem @item={{item}} />
        {{/each}}</article>`
    , { items });

  equalsElement(view.element, 'article', {},
    stripTight`
        <aside>0:<p>0.0</p><p>0.1</p></aside>
        <aside>1:<!----></aside>
        <aside>2:<p>2.0</p><p>2.1</p></aside>`
  );
});

QUnit.test('correct scope - complex yield', () => {
  env.registerEmberishCurlyComponent('item-list', EmberishCurlyComponent.extend() as any,
    stripTight`
      <ul>
        {{#each items key="id" as |item|}}
          <li>{{item.id}}: {{yield item}}</li>
        {{/each}}
      </ul>`
  );

  let items = [
    { id: '1', name: 'Foo', description: 'Foo!' },
    { id: '2', name: 'Bar', description: 'Bar!' },
    { id: '3', name: 'Baz', description: 'Baz!' }
  ];

  appendViewFor(
    stripTight`
      {{#item-list items=items as |item|}}
        {{item.name}}{{#if showDescription}} - {{item.description}}{{/if}}
      {{/item-list}}`
    , { items, showDescription: false }
  );

  assertEmberishElement('div',
    stripTight`
      <ul>
        <li>1: Foo<!----></li>
        <li>2: Bar<!----></li>
        <li>3: Baz<!----></li>
      </ul>`
  );

  view.rerender({ items, showDescription: true });

  assertEmberishElement('div',
    stripTight`
      <ul>
        <li>1: Foo - Foo!</li>
        <li>2: Bar - Bar!</li>
        <li>3: Baz - Baz!</li>
      </ul>`
  );
});

QUnit.test('correct scope - self', () => {
  class FooBar extends BasicComponent {
    public foo = 'foo';
    public bar = 'bar';
  }

  env.registerBasicComponent('FooBar', FooBar, `<p>{{foo}} {{bar}} {{@baz}}</p>`);

  appendViewFor(
    stripTight`
      <div>
        <FooBar />
        <FooBar @baz={{zomg}} />
      </div>`,
    { zomg: "zomg" }
  );

  equalsElement(view.element, 'div', {},
    stripTight`
        <p>foo bar </p>
        <p>foo bar zomg</p>`
  );
});

module('Curly Components - smoke test dynamicScope access');

QUnit.test('component has access to dynamic scope', function () {
  class SampleComponent extends EmberishCurlyComponent {
    static fromDynamicScope = ['theme'];
  }

  SampleComponent[CLASS_META].seal();

  env.registerEmberishCurlyComponent('sample-component', SampleComponent, '{{theme}}');

  appendViewFor('{{#-with-dynamic-vars theme="light"}}{{sample-component}}{{/-with-dynamic-vars}}');

  assertEmberishElement('div', 'light');
});

module('Curly Components - positional arguments');

QUnit.test('static named positional parameters', function () {
  class SampleComponent extends EmberishCurlyComponent {
    static positionalParams = ['person', 'age'];
  }

  SampleComponent[CLASS_META].seal();

  env.registerEmberishCurlyComponent('sample-component', SampleComponent, '{{person}}{{age}}');

  appendViewFor('{{sample-component "Quint" 4}}');

  assertEmberishElement('div', 'Quint4');
});

QUnit.test('dynamic named positional parameters', function () {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: ['person', 'age']
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, '{{person}}{{age}}');

  appendViewFor('{{sample-component myName myAge}}', {
    myName: 'Quint',
    myAge: 4
  });

  assertEmberishElement('div', 'Quint4');

  set(view, 'myName', 'Edward');
  set(view, 'myAge', 5);
  rerender();

  assertEmberishElement('div', 'Edward5');
});

QUnit.test('if a value is passed as a non-positional parameter, it takes precedence over the named one', assert => {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: ['name']
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, '{{name}}');

  assert.throws(() => {
    appendViewFor('{{sample-component notMyName name=myName}}', {
      myName: 'Quint',
      notMyName: 'Sergio'
    });
  }, "You cannot specify both a positional param (at position 0) and the hash argument `name`.");
});

QUnit.test('static arbitrary number of positional parameters', function () {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: 'names'
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, '{{#each names key="@index" as |name|}}{{name}}{{/each}}');

  appendViewFor(
    stripTight`<div>{{sample-component "Foo" 4 "Bar"}}
      {{sample-component "Foo" 4 "Bar" 5 "Baz"}}
      {{!sample-component "Foo" 4 "Bar" 5 "Baz"}}</div>`);

  let first = <Element>view.element.firstChild;
  let second = <Element>first.nextSibling;
  // let third = <Element>second.nextSibling;

  assertElementIsEmberishElement(first, 'div', 'Foo4Bar');
  assertElementIsEmberishElement(second, 'div', 'Foo4Bar5Baz');
  // equalsElement(third, ...emberishElement('div', { id: 'helper' }, 'Foo4Bar5Baz'));
});

QUnit.test('arbitrary positional parameter conflict with hash parameter is reported', assert => {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: 'names'
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, '{{#each attrs.names key="@index" as |name|}}{{name}}{{/each}}');

  assert.throws(function () {
    appendViewFor('{{sample-component "Foo" 4 "Bar" names=numbers id="args-3"}}', {
      numbers: [1, 2, 3]
    });
  }, `You cannot specify positional parameters and the hash argument \`names\`.`);
});

QUnit.test('can use hash parameter instead of arbitrary positional param [GH #12444]', function () {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: 'names'
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, '{{#each names key="@index" as |name|}}{{name}}{{/each}}');

  appendViewFor('{{sample-component names=things}}', {
    things: ['Foo', 4, 'Bar']
  });

  assertEmberishElement('div', 'Foo4Bar');
});

QUnit.test('can use hash parameter instead of positional param', function () {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: ['first', 'second']
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, '{{first}} - {{second}}');

  appendViewFor(`<div>
    {{sample-component "one" "two"}}
    {{sample-component "one" second="two"}}
    {{sample-component first="one" second="two"}}</div>
  `, {
      things: ['Foo', 4, 'Bar']
    });

  let first = view.element.firstElementChild;
  let second = first && first.nextElementSibling;
  let third = second && second.nextElementSibling;

  assertElementIsEmberishElement(first, 'div', 'one - two');
  assertElementIsEmberishElement(second, 'div', 'one - two');
  assertElementIsEmberishElement(third, 'div', 'one - two');
});

QUnit.test('dynamic arbitrary number of positional parameters', function () {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: 'n'
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, '{{#each attrs.n key="@index" as |name|}}{{name}}{{/each}}');

  appendViewFor('<div>{{sample-component user1 user2}}{{!component "sample-component" user1 user2}}</div>', {
    user1: 'Foo',
    user2: 4
  });

  let first = view.element.firstElementChild;
  // let second = first.nextElementSibling;

  assertElementIsEmberishElement(first, 'div', 'Foo4');
  // assertElementIsEmberishElement(first, 'div', 'Foo4');

  set(view, 'user1', "Bar");
  set(view, 'user2', "5");
  rerender();

  assertElementIsEmberishElement(first, 'div', 'Bar5');
  // assertElementIsEmberishElement(second, 'div', 'Bar5');

  set(view, 'user2', '6');
  rerender();

  assertElementIsEmberishElement(first, 'div', 'Bar6');
  // assertElementIsEmberishElement(second, 'div', 'Bar6');
});

QUnit.test('{{component}} helper works with positional params', function () {
  let SampleComponent = EmberishCurlyComponent.extend();

  SampleComponent.reopenClass({
    positionalParams: ['name', 'age']
  });

  env.registerEmberishCurlyComponent('sample-component', SampleComponent as any, `{{attrs.name}}{{attrs.age}}`);

  appendViewFor(`{{component "sample-component" myName myAge}}`, {
    myName: 'Quint',
    myAge: 4
  });

  assertEmberishElement('div', 'Quint4');

  set(view, 'myName', 'Edward');
  set(view, 'myAge', '5');
  rerender();

  assertEmberishElement('div', 'Edward5');

  set(view, 'myName', 'Quint');
  set(view, 'myAge', '4');
  rerender();

  assertEmberishElement('div', 'Quint4');
});

module("Emberish Components - parentView");

QUnit.skip('components in template of a yielding component should have the proper parentView', (assert) => {
  let outer: EmberishCurlyComponent | undefined;
  let innerTemplate: EmberishCurlyComponent | undefined;
  let innerLayout: EmberishCurlyComponent | undefined;

  let Outer = EmberishCurlyComponent.extend({
    init(this: EmberishCurlyComponent) {
      this._super(...arguments);
      outer = this;
    }
  }) as any;

  let InnerInTemplate = EmberishCurlyComponent.extend({
    init(this: EmberishCurlyComponent) {
      this._super(...arguments);
      innerTemplate = this;
    }
  }) as any;

  let InnerInLayout = EmberishCurlyComponent.extend({
    init(this: EmberishCurlyComponent) {
      this._super(...arguments);
      innerLayout = this;
    }
  }) as any;

  env.registerEmberishCurlyComponent('x-inner-in-layout', InnerInLayout, '');
  env.registerEmberishCurlyComponent('x-inner-in-template', InnerInTemplate, '');
  env.registerEmberishCurlyComponent('x-outer', Outer, `{{x-inner-in-layout}}{{yield}}`);

  appendViewFor('{{#x-outer}}{{#x-inner-in-template}}{{/x-inner-in-template}}{{/x-outer}}');

  assertEmberishElement('div');

  assert.ok(innerTemplate, 'expected inner to render');
  assert.ok(innerLayout, 'expected innerLayout to render');
  assert.ok(outer, 'expected outer to render');

  equalObject(innerTemplate!.parentView as any, outer as any, 'receives the wrapping component as its parentView in template blocks');
  equalObject(innerLayout!.parentView as any, outer as any, 'receives the wrapping component as its parentView in layout');
  equalObject(outer!.parentView as any, view as any, 'x-outer receives the ambient scope as its parentView');
});

function inspect(obj: EmberObject) {
  return obj && `<#Object:${obj._guid}>`;
}

function equalObject(actual: EmberObject, expected: EmberObject, msg: string) {
  QUnit.assert.strictEqual(inspect(actual), inspect(expected), msg);
}

QUnit.skip('newly-added sub-components get correct parentView', function () {
  let outer: EmberishCurlyComponent | undefined;
  let inner: EmberishCurlyComponent | undefined;

  let Outer = EmberishCurlyComponent.extend({
    init(this: EmberishCurlyComponent) {
      this._super(...arguments);
      outer = this;
    }
  });

  let Inner = EmberishCurlyComponent.extend({
    init(this: EmberishCurlyComponent) {
      this._super(...arguments);
      inner = this;
    }
  });

  env.registerEmberishCurlyComponent('x-outer', Outer as any, `{{yield}}`);
  env.registerEmberishCurlyComponent('x-inner', Inner as any, '');

  appendViewFor('{{#x-outer}}{{#if showInner}}{{x-inner}}{{/if}}{{/x-outer}}', { showInner: false });

  equalObject(outer!.parentView as any, view, 'x-outer receives the ambient scope as its parentView');

  set(view, 'showInner', true);
  rerender();

  equalObject(inner!.parentView as any, outer!, 'receives the wrapping component as its parentView in template blocks');
  equalObject(outer!.parentView as any, view, 'x-outer receives the ambient scope as its parentView');
});

module('Emberish closure components');

QUnit.test('component helper can handle aliased block components with args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, 'Hello {{arg1}} {{yield}}');

  appendViewFor(
    stripTight`
      {{#with (hash comp=(component 'foo-bar')) as |my|}}
        {{#component my.comp arg1="World!"}}Test1{{/component}} Test2
      {{/with}}
    `
  );

  assertText('Hello World! Test1 Test2');
});

QUnit.test('component helper can handle aliased block components without args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, 'Hello {{yield}}');

  appendViewFor(
    stripTight`
      {{#with (hash comp=(component 'foo-bar')) as |my|}}
        {{#component my.comp}}World!{{/component}} Test
      {{/with}}
    `
  );

  assertText('Hello World! Test');
});

QUnit.test('component helper can handle aliased inline components with args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, 'Hello {{arg1}}');

  appendViewFor(
    stripTight`
      {{#with (hash comp=(component 'foo-bar')) as |my|}}
        {{component my.comp arg1="World!"}} Test
      {{/with}}
    `
  );

  assertText('Hello World! Test');
});

QUnit.test('component helper can handle aliased inline components without args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, 'Hello');

  appendViewFor(
    stripTight`
      {{#with (hash comp=(component 'foo-bar')) as |my|}}
        {{component my.comp}} World!
      {{/with}}
    `
  );

  assertText('Hello World!');
});

QUnit.test('component helper can handle higher order inline components with args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, '{{yield (hash comp=(component "baz-bar"))}}');
  env.registerEmberishCurlyComponent('baz-bar', null, 'Hello {{arg1}}');

  appendViewFor(
    stripTight`
      {{#foo-bar as |my|}}
        {{component my.comp arg1="World!"}} Test
      {{/foo-bar}}
    `
  );

  assertText('Hello World! Test');
});

QUnit.test('component helper can handle higher order inline components without args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, '{{yield (hash comp=(component "baz-bar"))}}');
  env.registerEmberishCurlyComponent('baz-bar', null, 'Hello');

  appendViewFor(
    stripTight`
      {{#foo-bar as |my|}}
        {{component my.comp}} World!
      {{/foo-bar}}
    `
  );

  assertText('Hello World!');
});

QUnit.test('component helper can handle higher order block components with args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, '{{yield (hash comp=(component "baz-bar"))}}');
  env.registerEmberishCurlyComponent('baz-bar', null, 'Hello {{arg1}} {{yield}}');

  appendViewFor(
    stripTight`
      {{#foo-bar as |my|}}
        {{#component my.comp arg1="World!"}}Test1{{/component}} Test2
      {{/foo-bar}}
    `
  );

  assertText('Hello World! Test1 Test2');
});

QUnit.test('component helper can handle higher order block components without args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, '{{yield (hash comp=(component "baz-bar"))}}');
  env.registerEmberishCurlyComponent('baz-bar', null, 'Hello {{arg1}} {{yield}}');

  appendViewFor(
    stripTight`
      {{#foo-bar as |my|}}
        {{#component my.comp}}World!{{/component}} Test
      {{/foo-bar}}
    `
  );

  assertText('Hello World! Test');
});

QUnit.test('component deopt can handle aliased inline components without args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, 'Hello');

  appendViewFor(
    stripTight`
      {{#with (hash comp=(component 'foo-bar')) as |my|}}
        {{my.comp}} World!
      {{/with}}
    `
  );

  assertText('Hello World!');
});

QUnit.test('component deopt can handle higher order inline components without args', () => {
  env.registerEmberishCurlyComponent('foo-bar', null, '{{yield (hash comp=(component "baz-bar"))}}');
  env.registerEmberishCurlyComponent('baz-bar', null, 'Hello');

  appendViewFor(
    stripTight`
      {{#foo-bar as |my|}}
        {{my.comp}} World!
      {{/foo-bar}}
    `
  );

  assertText('Hello World!');
});

QUnit.test('component helper can curry arguments', () => {
  let FooBarComponent = EmberishCurlyComponent.extend();

  FooBarComponent.reopenClass({
    positionalParams: ["one", "two", "three", "four", "five", "six"]
  });

  env.registerEmberishCurlyComponent('foo-bar', FooBarComponent as any, stripTight`
    1. [{{one}}]
    2. [{{two}}]
    3. [{{three}}]
    4. [{{four}}]
    5. [{{five}}]
    6. [{{six}}]

    {{yield}}

    a. [{{a}}]
    b. [{{b}}]
    c. [{{c}}]
    d. [{{d}}]
    e. [{{e}}]
    f. [{{f}}]`);

  appendViewFor(
    stripTight`
      {{#with (component "foo-bar" "outer 1" "outer 2" a="outer a" b="outer b" c="outer c" e="outer e") as |outer|}}
        {{#with (component outer "inner 1" a="inner a" d="inner d" e="inner e") as |inner|}}
          {{#component inner "invocation 1" "invocation 2" a="invocation a" b="invocation b"}}---{{/component}}
        {{/with}}
      {{/with}}
    `

  );
  assertText(stripTight`
    1. [outer 1]
    2. [outer 2]
    3. [inner 1]
    4. [invocation 1]
    5. [invocation 2]
    6. []

    ---

    a. [invocation a]
    b. [invocation b]
    c. [outer c]
    d. [inner d]
    e. [inner e]
    f. []
  `);
});

module("Emberish Component - ids");

QUnit.test('emberish component should have unique IDs', assert => {
  env.registerEmberishCurlyComponent('x-curly', null, '');
  env.registerEmberishGlimmerComponent('XGlimmer', null, '<div ...attributes />');

  appendViewFor(
    stripTight`
      <div>
        {{x-curly}}
        {{x-curly}}
        <XGlimmer />
        <XGlimmer />
        {{x-curly}}
        <XGlimmer />
      </div>`
  );

  equalsElement(view.element.childNodes[0] as Element, 'div', { id: regex(/^ember\d*$/), class: 'ember-view' }, '');
  equalsElement(view.element.childNodes[1] as Element, 'div', { id: regex(/^ember\d*$/), class: 'ember-view' }, '');
  equalsElement(view.element.childNodes[2] as Element, 'div', { id: regex(/^ember\d*$/), class: 'ember-view' }, '');
  equalsElement(view.element.childNodes[3] as Element, 'div', { id: regex(/^ember\d*$/), class: 'ember-view' }, '');
  equalsElement(view.element.childNodes[4] as Element, 'div', { id: regex(/^ember\d*$/), class: 'ember-view' }, '');
  equalsElement(view.element.childNodes[5] as Element, 'div', { id: regex(/^ember\d*$/), class: 'ember-view' }, '');

  let IDs = {};

  function markAsSeen(element: Element) {
    IDs[element.id] = (IDs[element.id] || 0) + 1;
  }

  markAsSeen(view.element.childNodes[0] as Element);
  markAsSeen(view.element.childNodes[1] as Element);
  markAsSeen(view.element.childNodes[2] as Element);
  markAsSeen(view.element.childNodes[3] as Element);
  markAsSeen(view.element.childNodes[4] as Element);
  markAsSeen(view.element.childNodes[5] as Element);

  assert.equal(Object.keys(IDs).length, 6, "Expected the components to each have a unique IDs");

  for (let id in IDs) {
    assert.equal(IDs[id], 1, `Expected ID ${id} to be unique`);
  }
});

module("Glimmer Component");

let styles = [{
  name: 'a div',
  tagName: 'div',
  test: QUnit.test
}, {
  name: 'a web component',
  tagName: 'not-an-ember-component',
  test: QUnit.test
}];

styles.forEach(style => {
  style.test(`NonBlock without attributes replaced with ${style.name}`, assert => {
    env.registerEmberishGlimmerComponent('NonBlock', null, `  <${style.tagName} ...attributes>In layout</${style.tagName}>  `);

    appendViewFor('<NonBlock />');

    let node = view.element.firstChild;
    equalsElement(view.element, style.tagName, { class: 'ember-view', id: regex(/^ember\d*$/) }, 'In layout');

    rerender();

    assert.strictEqual(node, view.element.firstChild, 'The inner element has not changed');
    equalsElement(view.element, style.tagName, { class: 'ember-view', id: regex(/^ember\d*$/) }, 'In layout');
  });

  style.test(`NonBlock with attributes replaced with ${style.name}`, function () {
    env.registerEmberishGlimmerComponent(
      'NonBlock',
      null,
      `  <${style.tagName} such="{{@stability}}" ...attributes>In layout</${style.tagName}>  `
    );

    appendViewFor('<NonBlock @stability={{stability}} />', { stability: 'stability' });

    let node = view.element;
    equalsElement(node, style.tagName, { such: 'stability', class: 'ember-view', id: regex(/^ember\d*$/) }, 'In layout');

    set(view, 'stability', 'changed!!!');
    rerender();

    assert.strictEqual(node.firstElementChild, view.element.firstElementChild, 'The inner element has not changed');
    equalsElement(node, style.tagName, { such: 'changed!!!', class: 'ember-view', id: regex(/^ember\d*$/) }, 'In layout');
  });

  QUnit.skip(`NonBlock replaced with ${style.name} (regression with single element in the root element)`, function () {
    env.registerEmberishGlimmerComponent(
      'NonBlock',
      EmberishGlimmerComponent,
      `  <${style.tagName} such="{{attrs.stability}}"><p>In layout</p></${style.tagName}>  `
    );

    appendViewFor('<NonBlock stability={{view.stability}} />', { stability: 'stability' });

    let node = view.element;
    equalsElement(node, style.tagName, { such: 'stability', class: 'ember-view', id: regex(/^ember\d*$/) }, '<p>In layout</p>');

    set(view, 'stability', 'changed!!!');
    rerender();

    assert.strictEqual(node.firstElementChild, view.element.firstElementChild, 'The inner element has not changed');
    equalsElement(node, style.tagName, { such: 'changed!!!', class: 'ember-view', id: regex(/^ember\d*$/) }, '<p>In layout</p>');
  });

  QUnit.skip(`NonBlock with class replaced with ${style.name} merges classes`, function () {
    env.registerEmberishGlimmerComponent('NonBlock', EmberishGlimmerComponent, `<${style.tagName} class="inner-class" />`);

    appendViewFor('<NonBlock class="{{outer}}" />', { outer: 'outer' });

    equalsElement(view.element, style.tagName, { class: classes('inner-class outer ember-view'), id: regex(/^ember\d*$/) }, '');

    set(view, 'outer', 'new-outer');
    rerender();

    equalsElement(view.element, style.tagName, { class: classes('inner-class new-outer ember-view'), id: regex(/^ember\d*$/) }, '');
  });

  QUnit.skip(`non-block with outer attributes replaced with ${style.name} shadows inner attributes`, function () {
    let component: MyComponent | undefined;

    class MyComponent extends EmberishGlimmerComponent {
      constructor(attrs: Object) {
        super(attrs);
        component = this;
      }
    }
    MyComponent[CLASS_META].seal();

    env.registerEmberishGlimmerComponent('NonBlock', MyComponent, `<${style.tagName} data-static="static" data-dynamic="{{internal}}" />`);

    appendViewFor('<NonBlock data-static="outer" data-dynamic="outer" />');

    equalsElement(view.element, style.tagName, {
      class: classes('ember-view'),
      id: regex(/^ember\d*$/),
      'data-static': 'outer',
      'data-dynamic': 'outer'
    }, '');

    set(component, 'internal', 'changed');
    equalsElement(view.element, style.tagName, {
      class: classes('ember-view'),
      id: regex(/^ember\d*$/),
      'data-static': 'outer',
      'data-dynamic': 'outer'
    }, '');
  });

  QUnit.skip(`non-block replaced with ${style.name} should have correct scope`, function () {
    class NonBlock extends EmberishGlimmerComponent {
      init() {
        this._super(...arguments);
        set(this, 'internal', 'stuff');
      }
    }
    NonBlock[CLASS_META].seal();

    env.registerEmberishGlimmerComponent('NonBlock', NonBlock, `<${style.tagName}>{{internal}}</${style.tagName}>`);

    appendViewFor('<NonBlock />');

    equalsElement(view.element, style.tagName, { class: classes('ember-view'), id: regex(/^ember\d*$/) }, 'stuff');
  });

  QUnit.skip(`non-block replaced with ${style.name} should have correct 'element'`, function () {
    let component: MyComponent;

    class MyComponent extends EmberishGlimmerComponent {
      constructor(attrs: Object) {
        super(attrs);
        component = this;
      }
    }
    MyComponent[CLASS_META].seal();

    env.registerEmberishGlimmerComponent('NonBlock', MyComponent, `<${style.tagName} />`);

    appendViewFor('<NonBlock />');

    equalsElement(view.element, style.tagName, { class: classes('ember-view'), id: regex(/^ember\d*$/) }, '');
  });

  QUnit.skip(`non-block replaced with ${style.name} should have inner attributes`, function () {
    class NonBlock extends EmberishGlimmerComponent {
      init() {
        this._super(...arguments);
        set(this, 'internal', 'stuff');
      }
    }
    NonBlock[CLASS_META].seal();

    env.registerEmberishGlimmerComponent('NonBlock', NonBlock, `<${style.tagName} data-static="static" data-dynamic="{{internal}}" />`);

    appendViewFor('<NonBlock />');

    equalsElement(view.element, style.tagName, {
      class: classes('ember-view'),
      id: regex(/^ember\d*$/),
      'data-static': 'static',
      'data-dynamic': 'stuff'
    }, '');
  });

  QUnit.skip(`only text attributes are reflected on the underlying DOM element (${style.name})`, function () {
    env.registerEmberishGlimmerComponent('NonBlock', EmberishGlimmerComponent, `<${style.tagName}>In layout</${style.tagName}>`);

    appendViewFor('<NonBlock static-prop="static text" concat-prop="{{view.dynamic}} text" dynamic-prop={{view.dynamic}} />', {
      dynamic: 'dynamic'
    });

    equalsElement(view.element, style.tagName, {
      class: classes('ember-view'),
      id: regex(/^ember\d*$/),
      'static-prop': 'static text',
      'concat-prop': 'dynamic text'
    }, 'In layout');
  });

});

QUnit.test(`Ensure components can be invoked`, function () {
  env.registerEmberishGlimmerComponent('Outer', null, `<Inner></Inner>`);
  env.registerEmberishGlimmerComponent('Inner', null, `<div ...attributes>hi!</div>`);

  appendViewFor('<Outer />');
  equalsElement(view.element, 'div', { class: classes('ember-view'), id: regex(/^ember\d*$/) }, 'hi!');
});

QUnit.test(`Glimmer component with element modifier`, function (assert) {
  env.registerEmberishGlimmerComponent('NonBlock', null, `  <div>In layout</div>  `);

  assert.throws(() => {
    appendViewFor('<NonBlock {{action}} />');
  }, new Error("Compile Error: Element modifiers are not allowed in components"), "should throw error");
});

QUnit.skip('attributes are not installed on the top level', assert => {
  let component: NonBlock | undefined;

  class NonBlock extends EmberishGlimmerComponent {

    init() {
      this._super(...arguments);
      component = this;
    }
  }
  NonBlock[CLASS_META].seal();

  // This is specifically attempting to trigger a 1.x-era heuristic that only copied
  // attrs that were present as defined properties on the component.
  NonBlock.prototype['text'] = null;
  NonBlock.prototype['dynamic'] = null;

  env.registerEmberishGlimmerComponent('NonBlock', NonBlock, '<NonBlock>In layout - {{attrs.text}} -- {{text}}</NonBlock>');

  appendViewFor('<NonBlock text="texting" dynamic={{dynamic}} />', {
    dynamic: 'dynamic'
  });

  equalsElement(view.element, 'non-block', {
    class: classes('ember-view'),
    id: regex(/^ember\d*$/),
    text: 'texting'
  }, 'In layout - texting -- null');
  assert.equal(component!.attrs['text'], 'texting');
  assert.equal(component!.attrs['dynamic'], 'dynamic');
  assert.strictEqual(component!['text'], null);
  assert.strictEqual(component!['dynamic'], null);

  rerender();

  equalsElement(view.element, 'non-block', {
    class: classes('ember-view'),
    id: regex(/^ember\d*$/),
    text: 'texting'
  }, 'In layout - texting -- <!---->');
  assert.equal(component!.attrs['text'], 'texting');
  assert.equal(component!.attrs['dynamic'], 'dynamic');
  assert.strictEqual(component!['text'], null);
  assert.strictEqual(component!['dynamic'], null);
});

QUnit.skip('non-block with properties on attrs and component class', function () {
  env.registerEmberishGlimmerComponent('NonBlock', EmberishGlimmerComponent, '<NonBlock>In layout - someProp: {{attrs.someProp}}</NonBlock>');

  appendViewFor('<NonBlock someProp="something here" />');

  assertEmberishElement('non-block', { someProp: 'something here' }, 'In layout - someProp: something here');
});

QUnit.skip('block with properties on attrs', function () {
  env.registerEmberishGlimmerComponent(
    'with-block',
    EmberishGlimmerComponent,
    '<with-block>In layout - someProp: {{attrs.someProp}} - {{yield}}</with-block>'
  );

  appendViewFor('<with-block someProp="something here">In template</with-block>');

  assertEmberishElement('with-block', { someProp: 'something here' }, 'In layout - someProp: something here - In template');
});

QUnit.skip('lookup of component takes priority over property', (assert) => {
  assert.expect(1);

  class MyComponent extends EmberishCurlyComponent {
    'some-component' = 'not-some-component';
    'some-prop' = 'some-prop';
  }

  class SomeComponent extends EmberishCurlyComponent {
  }

  env.registerEmberishCurlyComponent('my-component', MyComponent, '{{some-prop}} {{some-component}}');
  env.registerEmberishCurlyComponent('some-component', SomeComponent, 'some-component');

  appendViewFor('{{my-component}}');

  assertAppended('<div>some-prop <div>some-component</div></div>');
});

QUnit.test('Curly component hooks (with attrs)', assert => {
  let instance: NonBlock | undefined;

  class NonBlock extends EmberishCurlyComponent {
    init() {
      instance = this;
    }
  }

  env.registerEmberishCurlyComponent('non-block', inspectHooks(NonBlock), 'In layout - someProp: {{@someProp}}');

  appendViewFor('{{non-block someProp=someProp}}', { someProp: 'wycats' });

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertFired(instance, 'didReceiveAttrs');
  assertFired(instance, 'willRender');
  assertFired(instance, 'didInsertElement');
  assertFired(instance, 'didRender');

  assertEmberishElement('div', 'In layout - someProp: wycats');

  set(view, 'someProp', 'tomdale');
  rerender();

  assertEmberishElement('div', 'In layout - someProp: tomdale');

  assertFired(instance, 'didReceiveAttrs', 2);
  assertFired(instance, 'willUpdate');
  assertFired(instance, 'willRender', 2);
  assertFired(instance, 'didUpdate');
  assertFired(instance, 'didRender', 2);

  rerender();

  assertEmberishElement('div', 'In layout - someProp: tomdale');

  assertFired(instance, 'didReceiveAttrs', 3);
  assertFired(instance, 'willUpdate', 2);
  assertFired(instance, 'willRender', 3);
  assertFired(instance, 'didUpdate', 2);
  assertFired(instance, 'didRender', 3);
});

QUnit.test('Curly component hooks (attrs as self props)', function () {
  let instance: NonBlock | undefined;

  class NonBlock extends EmberishCurlyComponent {
    init() {
      instance = this;
    }
  }

  env.registerEmberishCurlyComponent('non-block', inspectHooks(NonBlock), 'In layout - someProp: {{someProp}}');

  appendViewFor('{{non-block someProp=someProp}}', { someProp: 'wycats' });

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertFired(instance, 'didReceiveAttrs');
  assertFired(instance, 'willRender');
  assertFired(instance, 'didInsertElement');
  assertFired(instance, 'didRender');

  assertEmberishElement('div', 'In layout - someProp: wycats');

  set(view, 'someProp', 'tomdale');
  rerender();

  assertEmberishElement('div', 'In layout - someProp: tomdale');

  assertFired(instance, 'didReceiveAttrs', 2);
  assertFired(instance, 'willUpdate');
  assertFired(instance, 'willRender', 2);
  assertFired(instance, 'didUpdate');
  assertFired(instance, 'didRender', 2);

  rerender();

  assertEmberishElement('div', 'In layout - someProp: tomdale');

  assertFired(instance, 'didReceiveAttrs', 3);
  assertFired(instance, 'willUpdate', 2);
  assertFired(instance, 'willRender', 3);
  assertFired(instance, 'didUpdate', 2);
  assertFired(instance, 'didRender', 3);
});

QUnit.test('Setting value attributeBinding to null results in empty string value', function (assert) {
  let instance: InputComponent | undefined;

  class InputComponent extends EmberishCurlyComponent {
    tagName = 'input';
    attributeBindings = ['value'];
    init() {
      instance = this;
    }
  }

  env.registerEmberishCurlyComponent('input-component', inspectHooks(InputComponent), 'input component');

  appendViewFor('{{input-component value=someProp}}', { someProp: null });

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  let element: HTMLInputElement = instance.element as HTMLInputElement;

  assert.equal(element.value, '');

  set(view, 'someProp', 'wycats');
  rerender();

  assert.equal(element.value, 'wycats');

  set(view, 'someProp', null);
  rerender();

  assert.equal(element.value, '');
});

QUnit.test('Setting class attributeBinding does not clobber ember-view', assert => {
  let instance: FooBarComponent | undefined;

  class FooBarComponent extends EmberishCurlyComponent {
    attributeBindings = ['class'];
    init() {
      instance = this;
    }
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBarComponent, 'FOO BAR');

  appendViewFor('{{foo-bar class=classes}}', { classes: "foo bar" });

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertEmberishElement('div', { class: classes('ember-view foo bar') }, 'FOO BAR');

  rerender();

  assertEmberishElement('div', { class: classes('ember-view foo bar') }, 'FOO BAR');

  set(view, 'classes', 'foo bar baz');
  rerender();

  assertEmberishElement('div', { class: classes('ember-view foo bar baz') }, 'FOO BAR');

  set(view, 'classes', 'foo bar');
  rerender();

  assertEmberishElement('div', { class: classes('ember-view foo bar') }, 'FOO BAR');
});

QUnit.test('Curly component hooks (force recompute)', assert => {
  let instance: NonBlock | undefined;

  class NonBlock extends EmberishCurlyComponent {
    init() {
      instance = this;
    }
  }

  env.registerEmberishCurlyComponent('non-block', inspectHooks(NonBlock), 'In layout - someProp: {{@someProp}}');

  appendViewFor('{{non-block someProp="wycats"}}');

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertFired(instance, 'didReceiveAttrs', 1);
  assertFired(instance, 'willRender', 1);
  assertFired(instance, 'didInsertElement', 1);
  assertFired(instance, 'didRender', 1);

  assertEmberishElement('div', 'In layout - someProp: wycats');

  rerender();

  assertEmberishElement('div', 'In layout - someProp: wycats');

  assertFired(instance, 'didReceiveAttrs', 1);
  assertFired(instance, 'willRender', 1);
  assertFired(instance, 'didRender', 1);

  instance.recompute();
  rerender();

  assertEmberishElement('div', 'In layout - someProp: wycats');

  assertFired(instance, 'didReceiveAttrs', 2);
  assertFired(instance, 'willUpdate', 1);
  assertFired(instance, 'willRender', 2);
  assertFired(instance, 'didUpdate', 1);
  assertFired(instance, 'didRender', 2);
});

QUnit.test('Glimmer component hooks', assert => {
  let instance: NonBlock | undefined;

  class NonBlock extends EmberishGlimmerComponent {
    init() {
      instance = this;
    }
  }

  env.registerEmberishGlimmerComponent('NonBlock', inspectHooks(NonBlock), '<div ...attributes>In layout - someProp: {{@someProp}}</div>');

  appendViewFor('<NonBlock @someProp={{someProp}} />', { someProp: 'wycats' });

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertFired(instance, 'didReceiveAttrs');
  assertFired(instance, 'willRender');
  assertFired(instance, 'didInsertElement');
  assertFired(instance, 'didRender');

  assertEmberishElement('div', 'In layout - someProp: wycats');

  set(view, 'someProp', 'tomdale');
  rerender();

  assertEmberishElement('div', 'In layout - someProp: tomdale');

  assertFired(instance, 'didReceiveAttrs', 2);
  assertFired(instance, 'willUpdate');
  assertFired(instance, 'willRender', 2);
  assertFired(instance, 'didUpdate');
  assertFired(instance, 'didRender', 2);

  rerender();

  assertEmberishElement('div', 'In layout - someProp: tomdale');

  assertFired(instance, 'didReceiveAttrs', 3);
  assertFired(instance, 'willUpdate', 2);
  assertFired(instance, 'willRender', 3);
  assertFired(instance, 'didUpdate', 2);
  assertFired(instance, 'didRender', 3);
});

QUnit.test('Glimmer component hooks (force recompute)', assert => {
  let instance: NonBlock | undefined;

  class NonBlock extends EmberishGlimmerComponent {
    init() {
      instance = this;
    }
  }

  env.registerEmberishGlimmerComponent('NonBlock', inspectHooks(NonBlock), '<div ...attributes>In layout - someProp: {{@someProp}}</div>');

  appendViewFor('<NonBlock @someProp="wycats" />');

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertFired(instance, 'didReceiveAttrs', 1);
  assertFired(instance, 'willRender', 1);
  assertFired(instance, 'didInsertElement', 1);
  assertFired(instance, 'didRender', 1);

  assertEmberishElement('div', 'In layout - someProp: wycats');

  rerender();

  assertEmberishElement('div', 'In layout - someProp: wycats');

  assertFired(instance, 'didReceiveAttrs', 1);
  assertFired(instance, 'willRender', 1);
  assertFired(instance, 'didRender', 1);

  instance.recompute();
  rerender();

  assertEmberishElement('div', 'In layout - someProp: wycats');

  assertFired(instance, 'didReceiveAttrs', 2);
  assertFired(instance, 'willUpdate', 1);
  assertFired(instance, 'willRender', 2);
  assertFired(instance, 'didUpdate', 1);
  assertFired(instance, 'didRender', 2);
});

module('Teardown');

QUnit.test('curly components are destroyed', function (assert) {
  let destroyed = 0;

  let DestroyMeComponent = EmberishCurlyComponent.extend({
    destroy(this: EmberishCurlyComponent) {
      this._super();
      destroyed++;
    }
  });

  env.registerEmberishCurlyComponent('destroy-me', DestroyMeComponent as any, 'destroy me!');

  appendViewFor(`{{#if cond}}{{destroy-me}}{{/if}}`, { cond: true });

  assert.strictEqual(destroyed, 0, 'destroy should not be called');

  view.rerender({ cond: false });

  assert.strictEqual(destroyed, 1, 'destroy should be called exactly one');
});

QUnit.test('glimmer components are destroyed', function (assert) {
  let destroyed = 0;

  let DestroyMeComponent = EmberishGlimmerComponent.extend({
    destroy(this: EmberishGlimmerComponent) {
      this._super();
      destroyed++;
    }
  });

  env.registerEmberishGlimmerComponent('DestroyMe', DestroyMeComponent as any, '<div ...attributes>destroy me!</div>');

  appendViewFor(`{{#if cond}}<DestroyMe />{{/if}}`, { cond: true });

  assert.strictEqual(destroyed, 0, 'destroy should not be called');

  view.rerender({ cond: false });

  assert.strictEqual(destroyed, 1, 'destroy should be called exactly one');
});

QUnit.test('component helpers component are destroyed', function (assert) {
  let destroyed = 0;

  let DestroyMeComponent = EmberishCurlyComponent.extend({
    destroy(this: EmberishCurlyComponent) {
      this._super();
      destroyed++;
    }
  });

  env.registerEmberishCurlyComponent('destroy-me', DestroyMeComponent as any, 'destroy me!');

  let AnotherComponent = EmberishCurlyComponent.extend();

  env.registerEmberishCurlyComponent('another-component', AnotherComponent as any, 'another thing!');

  appendViewFor(`{{component componentName}}`, { componentName: 'destroy-me' });

  assert.strictEqual(destroyed, 0, 'destroy should not be called');

  view.rerender({ componentName: 'another-component' });

  assert.strictEqual(destroyed, 1, 'destroy should be called exactly one');
});

QUnit.test('components inside a list are destroyed', function (assert) {
  let destroyed: number[] = [];

  let DestroyMeComponent = EmberishGlimmerComponent.extend({
    destroy(this: EmberishGlimmerComponent) {
      this._super();
      destroyed.push(this.attrs.item);
    }
  });

  env.registerEmberishGlimmerComponent('DestroyMe', DestroyMeComponent as any, '<div>destroy me!</div>');

  appendViewFor(`{{#each list key='@primitive' as |item|}}<DestroyMe @item={{item}} />{{/each}}`, { list: [1, 2, 3, 4, 5] });

  assert.strictEqual(destroyed.length, 0, 'destroy should not be called');

  view.rerender({ list: [1, 2, 3] });

  assert.deepEqual(destroyed, [4, 5], 'destroy should be called exactly twice');

  view.rerender({ list: [3, 2, 1] });

  assert.deepEqual(destroyed, [4, 5], 'destroy should be called exactly twice');

  view.rerender({ list: [] });

  assert.deepEqual(destroyed, [4, 5, 3, 2, 1], 'destroy should be called for each item');
});

QUnit.test('components that are "destroyed twice" are destroyed once', function (assert) {
  let destroyed: string[] = [];

  let DestroyMeComponent = EmberishCurlyComponent.extend({
    destroy(this: EmberishCurlyComponent) {
      this._super();
      destroyed.push(this.attrs.from);
    }
  });

  let DestroyMe2Component = EmberishCurlyComponent.extend({
    destroy(this: EmberishCurlyComponent) {
      this._super();
      destroyed.push(this.attrs.from);
    }
  });

  env.registerEmberishCurlyComponent('destroy-me', DestroyMeComponent as any, '{{#if @cond}}{{destroy-me-inner from="inner"}}{{/if}}');
  env.registerEmberishCurlyComponent('destroy-me-inner', DestroyMe2Component as any, 'inner');

  appendViewFor(`{{#if cond}}{{destroy-me from="root" cond=child.cond}}{{/if}}`, { cond: true, child: { cond: true } });

  assert.deepEqual(destroyed, [], 'destroy should not be called');

  view.rerender({ cond: false, child: { cond: false } });

  assert.deepEqual(destroyed, ['root', 'inner'], 'destroy should be called exactly once per component');
});

QUnit.test('deeply nested destructions', function (assert) {
  let destroyed: string[] = [];

  let DestroyMe1Component = EmberishGlimmerComponent.extend({
    destroy(this: EmberishGlimmerComponent) {
      this._super();
      destroyed.push(`destroy-me1: ${this.attrs.item}`);
    }
  });

  let DestroyMe2Component = EmberishCurlyComponent.extend({
    destroy(this: EmberishCurlyComponent) {
      this._super();
      destroyed.push(`destroy-me2: ${this.attrs.from} - ${this.attrs.item}`);
    }
  });

  env.registerEmberishGlimmerComponent('DestroyMe1', DestroyMe1Component as any, '<div>{{#destroy-me2 item=@item from="destroy-me1"}}{{yield}}{{/destroy-me2}}</div>');
  env.registerEmberishCurlyComponent('destroy-me2', DestroyMe2Component as any, 'Destroy me! {{yield}}');

  appendViewFor(`{{#each list key='@primitive' as |item|}}<DestroyMe1 @item={{item}}>{{#destroy-me2 from="root" item=item}}{{/destroy-me2}}</DestroyMe1>{{/each}}`, { list: [1, 2, 3, 4, 5] });

  assert.strictEqual(destroyed.length, 0, 'destroy should not be called');

  view.rerender({ list: [1, 2, 3] });

  assert.deepEqual(destroyed, [
    "destroy-me1: 4",
    "destroy-me2: destroy-me1 - 4",
    "destroy-me2: root - 4",
    "destroy-me1: 5",
    "destroy-me2: destroy-me1 - 5",
    "destroy-me2: root - 5"
  ], 'destroy should be called exactly twice');

  destroyed = [];

  view.rerender({ list: [3, 2, 1] });

  assert.deepEqual(destroyed, [], 'destroy should be called exactly twice');

  view.rerender({ list: [] });

  assert.deepEqual(destroyed, [
    "destroy-me1: 3",
    "destroy-me2: destroy-me1 - 3",
    "destroy-me2: root - 3",
    "destroy-me1: 2",
    "destroy-me2: destroy-me1 - 2",
    "destroy-me2: root - 2",
    "destroy-me1: 1",
    "destroy-me2: destroy-me1 - 1",
    "destroy-me2: root - 1"
  ], 'destroy should be called for each item');
});

QUnit.test('components inside the root are destroyed when the render result is destroyed', function (assert) {
  let glimmerDestroyed = false;
  let curlyDestroyed = false;

  let DestroyMe1Component = EmberishGlimmerComponent.extend({
    destroy(this: EmberishGlimmerComponent) {
      this._super();
      glimmerDestroyed = true;
    }
  });

  let DestroyMe2Component = EmberishCurlyComponent.extend({
    destroy(this: EmberishCurlyComponent) {
      this._super();
      curlyDestroyed = true;
    }
  });

  env.registerEmberishGlimmerComponent('DestroyMe1', DestroyMe1Component as any, '<div>Destry me!</div>');
  env.registerEmberishCurlyComponent('destroy-me2', DestroyMe2Component as any, 'Destroy me too!');

  appendViewFor(`<DestroyMe1 id="destroy-me1"/>{{destroy-me2 id="destroy-me2"}}`);

  assert.strictEqual(glimmerDestroyed, false, 'the glimmer component should not be destroyed');
  assert.strictEqual(curlyDestroyed, false, 'the curly component should not be destroyed');

  view.destroy();

  assert.strictEqual(glimmerDestroyed, true, 'the glimmer component destroy hook was called');
  assert.strictEqual(curlyDestroyed, true, 'the glimmer component destroy hook was called');

  assert.strictEqual(document.querySelectorAll('#destroy-me1').length, 0, 'component DOM node was removed from DOM');
  assert.strictEqual(document.querySelectorAll('#destroy-me2').length, 0, 'component DOM node was removed from DOM');

  assert.strictEqual(document.querySelector('#qunit-fixture')!.childElementCount, 0, 'root view was removed from DOM');
});

QUnit.test('tagless components render properly', () => {
  class FooBar extends BasicComponent { }

  env.registerStaticTaglessComponent('foo-bar', FooBar, `Michael Jordan says "Go Tagless"`);

  appendViewFor(`{{foo-bar}}`);
  assertAppended('Michael Jordan says "Go Tagless"');

  rerender();

  assertAppended('Michael Jordan says "Go Tagless"');
});

module('late bound layout');

QUnit.test('can bind the layout late', () => {
  class FooBar extends EmberishCurlyComponent {
    layout = env.registerTemplate('my-dynamic-layout', 'Swap - {{yield}}');
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, null);

  appendViewFor('{{#foo-bar}}YIELD{{/foo-bar}}');

  equalsElement(view.element, 'div', {
    class: classes('ember-view'),
    id: regex(/^ember\d*$/)
  }, 'Swap - YIELD');
});

module('appendable components');

QUnit.test('it does not work on optimized appends', () => {
  class FooBar extends EmberishCurlyComponent { }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, 'foo bar');

  let definition = env.resolveComponentDefinition('foo-bar', {});

  appendViewFor('{{foo}}', { foo: definition });

  assertAppended('[object Object]');

  rerender();

  assertAppended('[object Object]');

  view.rerender({ foo: 'foo' });

  assertAppended('foo');

  view.rerender({ foo: definition });

  assertAppended('[object Object]');
});

QUnit.test('it works on unoptimized appends (dot paths)', () => {
  class FooBar extends EmberishCurlyComponent { }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, 'foo bar');

  let definition = env.resolveComponentDefinition('foo-bar', {});

  appendViewFor('{{foo.bar}}', { foo: { bar: definition } });

  assertEmberishElement('div', {}, 'foo bar');

  rerender();

  assertEmberishElement('div', {}, 'foo bar');

  view.rerender({ foo: { bar: 'lol' } });

  assertAppended('lol');

  rerender();

  assertAppended('lol');

  view.rerender({ foo: { bar: 'omg' } });

  assertAppended('omg');

  view.rerender({ foo: { bar: definition } });

  assertEmberishElement('div', {}, 'foo bar');
});

QUnit.test('it works on unoptimized appends (this paths)', () => {
  class FooBar extends EmberishCurlyComponent { }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, 'foo bar');

  let definition = env.resolveComponentDefinition('foo-bar', {});

  appendViewFor('{{this.foo}}', { foo: definition });

  assertEmberishElement('div', {}, 'foo bar');

  rerender();

  assertEmberishElement('div', {}, 'foo bar');

  view.rerender({ foo: 'lol' });

  assertAppended('lol');

  rerender();

  assertAppended('lol');

  view.rerender({ foo: 'omg' });

  assertAppended('omg');

  view.rerender({ foo: definition });

  assertEmberishElement('div', {}, 'foo bar');
});

QUnit.test('it works on unoptimized appends when initially not a component (dot paths)', () => {
  class FooBar extends EmberishCurlyComponent { }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, 'foo bar');

  let definition = env.resolveComponentDefinition('foo-bar', {});

  appendViewFor('{{foo.bar}}', { foo: { bar: 'lol' } });

  assertAppended('lol');

  rerender();

  assertAppended('lol');

  view.rerender({ foo: { bar: definition } });

  assertEmberishElement('div', {}, 'foo bar');

  rerender();

  assertEmberishElement('div', {}, 'foo bar');

  view.rerender({ foo: { bar: 'lol' } });

  assertAppended('lol');
});

QUnit.test('it works on unoptimized appends when initially not a component (this paths)', () => {
  class FooBar extends EmberishCurlyComponent { }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, 'foo bar');

  let definition = env.resolveComponentDefinition('foo-bar', {});

  appendViewFor('{{this.foo}}', { foo: 'lol' });

  assertAppended('lol');

  rerender();

  assertAppended('lol');

  view.rerender({ foo: definition });

  assertEmberishElement('div', {}, 'foo bar');

  rerender();

  assertEmberishElement('div', {}, 'foo bar');

  view.rerender({ foo: 'lol' });

  assertAppended('lol');
});

module('bounds tracking');

QUnit.test('it works for wrapped (curly) components', function (assert) {
  let instance: FooBar | undefined;

  class FooBar extends EmberishCurlyComponent {
    tagName = 'span';

    constructor() {
      super();
      instance = this;
    }
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, 'foo bar');

  appendViewFor('zomg {{foo-bar}} wow');

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertEmberishElement('span', {}, 'foo bar');

  assert.equal(instance.bounds.parentElement(), document.querySelector('#qunit-fixture'));
  assert.equal(instance.bounds.firstNode(), instance.element);
  assert.equal(instance.bounds.lastNode(), instance.element);
});

QUnit.test('it works for tagless components', function (assert) {
  let instance: FooBar | undefined;

  class FooBar extends EmberishCurlyComponent {
    tagName = '';

    constructor() {
      super();
      instance = this;
    }
  }

  env.registerEmberishCurlyComponent('foo-bar', FooBar, '<span id="first-node">foo</span> <span id="before-last-node">bar</span>!');

  appendViewFor('zomg {{foo-bar}} wow');

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertAppended('zomg <span id="first-node">foo</span> <span id="before-last-node">bar</span>! wow');

  assert.equal(instance.bounds.parentElement(), document.querySelector('#qunit-fixture'));
  assert.equal(instance.bounds.firstNode(), document.querySelector('#first-node'));
  assert.equal(instance.bounds.lastNode(), document.querySelector('#before-last-node')!.nextSibling);
});

QUnit.test('it works for unwrapped components', function (assert) {
  let instance: FooBar | undefined;

  class FooBar extends EmberishGlimmerComponent {
    constructor() {
      super();
      instance = this;
    }
  }

  env.registerEmberishGlimmerComponent('FooBar', FooBar, '<!-- ohhh --><span ...attributes>foo bar!</span>');

  appendViewFor('zomg <FooBar /> wow');

  assert.ok(instance, 'instance is created');

  if (instance === undefined) {
    return;
  }

  assertEmberishElement('span', {}, 'foo bar!');

  assert.equal(instance.bounds.parentElement(), document.querySelector('#qunit-fixture'));
  assert.equal(instance.bounds.firstNode(), instance.element.previousSibling);
  assert.equal(instance.bounds.lastNode(), instance.element);
});
