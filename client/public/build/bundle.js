
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    /**
     * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
     * Event dispatchers are functions that can take two arguments: `name` and `detail`.
     *
     * Component events created with `createEventDispatcher` create a
     * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
     * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
     * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
     * property and can contain any type of data.
     *
     * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
     */
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* src/Tama.svelte generated by Svelte v3.59.2 */

    const file$3 = "src/Tama.svelte";

    function create_fragment$4(ctx) {
    	let div;
    	let svg;
    	let g19;
    	let g0;
    	let path0;
    	let path1;
    	let g3;
    	let g1;
    	let path2;
    	let g2;
    	let path3;
    	let g9;
    	let g4;
    	let path4;
    	let g5;
    	let path5;
    	let g6;
    	let path6;
    	let path7;
    	let g7;
    	let path8;
    	let g8;
    	let path9;
    	let path10;
    	let g18;
    	let g10;
    	let path11;
    	let g11;
    	let path12;
    	let path13;
    	let g12;
    	let path14;
    	let path15;
    	let g13;
    	let path16;
    	let g14;
    	let path17;
    	let path18;
    	let path19;
    	let g15;
    	let path20;
    	let g16;
    	let path21;
    	let g17;
    	let path22;
    	let g20;
    	let path23;
    	let path24;
    	let path25;
    	let path26;
    	let path27;
    	let path28;
    	let polygon;

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			g19 = svg_element("g");
    			g0 = svg_element("g");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			g3 = svg_element("g");
    			g1 = svg_element("g");
    			path2 = svg_element("path");
    			g2 = svg_element("g");
    			path3 = svg_element("path");
    			g9 = svg_element("g");
    			g4 = svg_element("g");
    			path4 = svg_element("path");
    			g5 = svg_element("g");
    			path5 = svg_element("path");
    			g6 = svg_element("g");
    			path6 = svg_element("path");
    			path7 = svg_element("path");
    			g7 = svg_element("g");
    			path8 = svg_element("path");
    			g8 = svg_element("g");
    			path9 = svg_element("path");
    			path10 = svg_element("path");
    			g18 = svg_element("g");
    			g10 = svg_element("g");
    			path11 = svg_element("path");
    			g11 = svg_element("g");
    			path12 = svg_element("path");
    			path13 = svg_element("path");
    			g12 = svg_element("g");
    			path14 = svg_element("path");
    			path15 = svg_element("path");
    			g13 = svg_element("g");
    			path16 = svg_element("path");
    			g14 = svg_element("g");
    			path17 = svg_element("path");
    			path18 = svg_element("path");
    			path19 = svg_element("path");
    			g15 = svg_element("g");
    			path20 = svg_element("path");
    			g16 = svg_element("g");
    			path21 = svg_element("path");
    			g17 = svg_element("g");
    			path22 = svg_element("path");
    			g20 = svg_element("g");
    			path23 = svg_element("path");
    			path24 = svg_element("path");
    			path25 = svg_element("path");
    			path26 = svg_element("path");
    			path27 = svg_element("path");
    			path28 = svg_element("path");
    			polygon = svg_element("polygon");
    			attr_dev(path0, "d", "M102.7,88.8c-0.1-0.2-0.3-0.4-0.4-0.6c-1.2-1.7-2.8-2.8-4.6-3.1h0c0,0,0,0,0,0h0l-2.5-0.4c-0.1,0-0.2,0-0.2,0\n\t\t\tc-1.5-10-2.3-15.2-2.4-15.8c-0.3-1.2-1.7-1.8-2.4-2.1c-0.5-3-3.3-20-4-21.9c-0.8-2.2-3.5-3-3.6-3l-0.1,0h-0.4\n\t\t\tc-0.8-1.8-1.9-3.5-3.3-4.9c-2.8-2.8-6.7-4.6-11.1-4.6c-6.4,0-12,3.9-14.3,9.4H53L53,42c-0.1,0-2.8,0.8-3.6,3\n\t\t\tc-0.7,1.8-3.5,18.9-4,21.9c-0.7,0.2-2.1,0.8-2.4,2c-0.1,0.6-0.9,5.8-2.4,15.8c-0.1,0-0.2,0-0.3,0l-2.5,0.4h0c0,0,0,0,0,0h0\n\t\t\tc-1.8,0.3-3.4,1.4-4.6,3.1c-0.1,0.2-0.3,0.4-0.4,0.6c-1.2,2.1-1.6,4.6-1.2,7.2c0.3,1.8,0.9,3.5,1.9,4.9c0.2,0.3,0.3,0.5,0.5,0.7\n\t\t\tc0.3,0.3,0.5,0.6,0.8,0.9c0.1,0.1,0.2,0.2,0.3,0.3h0c0,0,0,0,0,0c0.1,0.1,0.1,0.1,0.2,0.2c0.1,0.1,0.2,0.2,0.4,0.3\n\t\t\tc0.1,0.1,0.2,0.2,0.4,0.3l0.2,0.1h0c0.2,0.1,0.3,0.2,0.5,0.3c0.2,0.1,0.5,0.2,0.7,0.3c0,0,0.1,0,0.1,0c0.2,0.1,0.4,0.1,0.6,0.2\n\t\t\tl0,0c0.6,0.2,1.2,0.3,1.8,0.3c0.3,0,0.6,0,0.9-0.1l0.1,0l0,0l2.5-0.4c0.3,0,0.6-0.1,0.9-0.2h0.1c0.3,0,0.6,0,0.9-0.1l0.1,0h0\n\t\t\tl0.1,0h0l2.4-0.4c1.2-0.2,2.3-0.7,3.2-1.5c0.8-0.7,1.5-1.5,2-2.6c4.9,1.7,9.9,2.5,14.9,2.5s10.1-0.8,14.9-2.5c1.1,2.3,3,3.7,5.2,4\n\t\t\tl2.4,0.4l0.1,0l0.1,0c0.3,0,0.6,0.1,0.9,0.1h0.1c0.3,0.1,0.6,0.2,0.9,0.2l2.3,0.3l0,0l0.1,0c0,0,0,0,0.1,0l0.1,0\n\t\t\tc0.3,0,0.6,0.1,0.9,0.1c0.6,0,1.2-0.1,1.8-0.3c0.3-0.1,0.5-0.2,0.7-0.3c0.2-0.1,0.4-0.2,0.7-0.3c0.2-0.1,0.4-0.2,0.6-0.4\n\t\t\tc0.1-0.1,0.2-0.1,0.3-0.2c0.1,0,0.1-0.1,0.2-0.1c0.1-0.1,0.2-0.1,0.3-0.2l0.2-0.2c0.1-0.1,0.2-0.2,0.3-0.3\n\t\t\tc0.3-0.3,0.5-0.6,0.8-0.9c0.2-0.2,0.3-0.4,0.5-0.7c0.8-1.3,1.5-2.8,1.8-4.4l0.1-0.6C104.3,93.4,103.9,90.9,102.7,88.8z M54.3,43.2\n\t\t\tc0.2-0.4,0.3-0.9,0.5-1.3c2.3-4.9,7.3-8.1,12.9-8.1c3.8,0,7.4,1.5,10.1,4.2c1.2,1.2,2.1,2.5,2.8,3.9c0.2,0.4,0.4,0.9,0.5,1.3\n\t\t\tc0.2,0.6,0.4,1.2,0.5,1.9c-3.6,4-8.7,6.2-14,6.2s-10.4-2.3-14-6.2C53.9,44.5,54.1,43.9,54.3,43.2z M50.6,45.4\n\t\t\tc0.4-1.1,1.6-1.8,2.3-2c-0.2,0.7-0.4,1.4-0.5,2.1c3.7,4.4,9.2,7.2,15.4,7.2s11.7-2.8,15.4-7.2c-0.1-0.7-0.3-1.4-0.5-2.1\n\t\t\tc0.7,0.3,1.9,0.9,2.3,2c0.5,1.5,3,15.8,3.9,21.7c-1.7,1.2-10,6.5-21.1,6.5s-19.4-5.3-21.1-6.5C47.6,61.2,50.1,46.9,50.6,45.4z\n\t\t\t M37.9,85.9L37.9,85.9l-0.1,0L37.9,85.9z M42.4,102.7c-0.6,0.4-1.2,0.6-1.8,0.7l-0.1,0c-0.7,0.1-1.4,0.1-2.2-0.2\n\t\t\tc-0.1,0-0.3-0.1-0.4-0.2c0,0-0.1,0-0.1-0.1c-0.2-0.1-0.4-0.2-0.5-0.3c-0.2-0.1-0.4-0.2-0.5-0.3l-0.1-0.1c-0.1,0-0.1-0.1-0.2-0.1\n\t\t\tc-0.1,0-0.1-0.1-0.2-0.1c-0.1-0.1-0.2-0.2-0.3-0.3l-0.1-0.1c0,0-0.1-0.1-0.1-0.1c-0.2-0.2-0.5-0.5-0.7-0.8\n\t\t\tc-0.1-0.2-0.3-0.3-0.4-0.6c-0.8-1.3-1.4-2.8-1.7-4.4c-0.3-2.3,0-4.6,1-6.4c0.1-0.2,0.2-0.4,0.3-0.5c0.9-1.4,2.2-2.3,3.7-2.5l0.1,0\n\t\t\tl0,0c0.7-0.1,1.3,0,2,0.1l0,0c0.1,0,0.3,0.1,0.4,0.1c0.1,0,0.2,0.1,0.3,0.1c2.4,1,4.3,3.9,4.8,7.2c0.1,0.7,0.1,1.4,0.1,2.1\n\t\t\tC45.6,99,44.3,101.5,42.4,102.7z M47.7,98.7c0,0.1-0.1,0.3-0.2,0.5c0,0,0,0,0,0c0,0.1-0.1,0.3-0.2,0.4l0,0.1\n\t\t\tc0,0.1-0.1,0.2-0.2,0.3l0,0.1c0,0,0,0,0,0.1l-0.1,0.1c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.2,0.3-0.3,0.4c0,0-0.1,0.1-0.1,0.2\n\t\t\tc0,0.1-0.1,0.1-0.1,0.2c-0.2,0.3-0.5,0.5-0.8,0.8c0,0-0.1,0.1-0.2,0.1c0,0-0.1,0.1-0.2,0.1c-0.1,0-0.1,0.1-0.2,0.1\n\t\t\tc-0.1,0.1-0.2,0.1-0.3,0.2c0,0,0,0,0,0c0,0,0,0,0,0c0,0,0,0,0,0h0c0,0,0,0,0,0c0.1-0.1,0.2-0.3,0.3-0.4c0.1-0.1,0.2-0.3,0.3-0.4\n\t\t\tc0,0,0,0,0,0c0.1-0.1,0.2-0.3,0.3-0.4c0.1-0.2,0.2-0.3,0.3-0.5c0,0,0,0,0,0c0.1-0.1,0.1-0.3,0.2-0.4c0.1-0.2,0.2-0.4,0.2-0.6\n\t\t\tc0.1-0.4,0.2-0.7,0.3-1.1c0-0.2,0.1-0.4,0.1-0.6c0-0.2,0.1-0.3,0.1-0.5c0-0.1,0-0.1,0-0.2c0-0.1,0-0.3,0.1-0.4c0,0,0-0.1,0-0.1\n\t\t\tc0-0.2,0-0.4,0-0.6c0-0.8,0-1.6-0.1-2.3c0-0.2-0.1-0.4-0.1-0.6c0-0.1-0.1-0.3-0.1-0.4c0-0.1,0-0.2-0.1-0.3c0-0.1-0.1-0.3-0.1-0.4\n\t\t\tc0,0,0-0.1,0-0.1c-0.1-0.2-0.1-0.4-0.2-0.5c0,0,0-0.1,0-0.1c-0.1-0.2-0.1-0.3-0.2-0.5c0,0,0,0,0,0c-0.1-0.2-0.2-0.3-0.2-0.5\n\t\t\tc-0.1-0.1-0.1-0.3-0.2-0.4c0-0.1-0.1-0.1-0.1-0.2c-0.1-0.1-0.1-0.2-0.2-0.4c-0.2-0.4-0.5-0.7-0.7-1.1c-0.1-0.1-0.2-0.3-0.3-0.4\n\t\t\tc-0.1-0.2-0.3-0.3-0.4-0.5c-0.1-0.1-0.2-0.2-0.3-0.3c0,0,0,0,0,0c-0.1-0.1-0.3-0.2-0.4-0.3c0,0,0,0,0,0c-0.1-0.1-0.3-0.2-0.4-0.3\n\t\t\tc-0.1-0.1-0.3-0.2-0.4-0.3v0c0,0,0,0,0,0c0.2,0,0.4,0.1,0.5,0.1c0.1,0,0.1,0,0.2,0.1c0.1,0,0.2,0.1,0.3,0.1c0.1,0,0.2,0.1,0.2,0.1\n\t\t\tc0.2,0.1,0.3,0.2,0.5,0.3c0.1,0,0.2,0.1,0.2,0.2c0.2,0.1,0.3,0.2,0.5,0.3c0.1,0.1,0.2,0.1,0.2,0.2c0.1,0.1,0.2,0.2,0.3,0.3\n\t\t\tc0.1,0.1,0.1,0.1,0.2,0.2c0.1,0.1,0.2,0.2,0.2,0.2s0.1,0.2,0.2,0.3c0,0.1,0.1,0.1,0.1,0.2c0.1,0.1,0.1,0.1,0.1,0.2\n\t\t\tc0.1,0.1,0.1,0.2,0.2,0.3c0.1,0.2,0.2,0.3,0.3,0.5c0.2,0.3,0.3,0.6,0.5,0.9c0,0.1,0.1,0.2,0.1,0.2c0.1,0.1,0.1,0.3,0.2,0.4\n\t\t\tc0,0.1,0.1,0.2,0.1,0.3c0,0.1,0.1,0.2,0.1,0.3c0.1,0.3,0.2,0.7,0.3,1c0.1,0.2,0.1,0.5,0.1,0.7c0.1,0.6,0.1,1.1,0.1,1.7\n\t\t\tc0,0.2,0,0.3,0,0.5c0,0.1,0,0.2,0,0.4c0,0,0,0.1,0,0.1l0,0.1c0,0.1,0,0.2,0,0.3c0,0.1,0,0.2-0.1,0.4l0,0.1c0,0.1,0,0.2-0.1,0.4\n\t\t\tl0,0.1c0,0.1,0,0.1-0.1,0.2c0,0.1,0,0.2-0.1,0.2l0,0.2C47.8,98.4,47.7,98.5,47.7,98.7z M49,99.7c-0.1,0.1-0.1,0.2-0.2,0.3l0,0.1\n\t\t\tc0,0,0,0.1-0.1,0.1c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.2-0.2,0.2c0,0.1-0.1,0.1-0.2,0.2\n\t\t\tc0,0,0,0,0,0c0,0,0-0.1,0.1-0.1c0.1-0.1,0.1-0.2,0.2-0.3c0,0,0-0.1,0.1-0.1c0-0.1,0.1-0.1,0.1-0.2c0.1-0.1,0.1-0.2,0.2-0.4l0-0.1\n\t\t\tc0.1-0.1,0.1-0.3,0.2-0.4c0-0.1,0-0.1,0.1-0.2c0-0.1,0.1-0.2,0.1-0.3c0-0.1,0-0.1,0.1-0.2c0,0,0-0.1,0-0.1c0-0.1,0.1-0.3,0.1-0.4\n\t\t\tc0,0,0,0,0,0c0-0.1,0-0.1,0-0.2c0-0.1,0.1-0.2,0.1-0.3c0-0.1,0-0.2,0.1-0.2c0,0,0-0.1,0-0.1c0-0.1,0-0.1,0-0.2l0.1-0.3\n\t\t\tc0-0.1,0-0.3,0.1-0.4c0-0.1,0-0.3,0-0.4l0,0l0,0c0-0.1,0-0.1,0-0.2c0-0.1,0-0.3,0-0.4c0-0.2,0-0.4,0-0.5c0-0.6,0-1.3-0.1-1.9\n\t\t\tc0-0.2-0.1-0.4-0.1-0.5c0-0.2-0.1-0.4-0.1-0.5c0-0.2-0.1-0.3-0.1-0.5c0-0.1-0.1-0.2-0.1-0.3c0-0.1-0.1-0.2-0.1-0.3\n\t\t\tc-0.1-0.4-0.3-0.8-0.5-1.2c-0.1-0.1-0.1-0.3-0.2-0.4c-0.1-0.1-0.1-0.2-0.2-0.4c-0.1-0.1-0.1-0.2-0.2-0.4c-0.1-0.2-0.3-0.5-0.5-0.7\n\t\t\tc-0.1-0.1-0.2-0.2-0.2-0.3c-0.1-0.1-0.2-0.2-0.3-0.3c-0.1-0.1-0.2-0.2-0.3-0.3c-0.1-0.1-0.3-0.3-0.4-0.4c-0.1-0.1-0.3-0.3-0.4-0.4\n\t\t\tc0,0,0,0-0.1-0.1c0,0-0.1,0-0.1-0.1c0,0,0,0,0,0c0.1,0,0.2,0.1,0.2,0.1c0.1,0,0.1,0.1,0.2,0.1c0.1,0.1,0.3,0.2,0.4,0.3\n\t\t\tc0.1,0.1,0.2,0.1,0.2,0.2c0.1,0.1,0.3,0.2,0.4,0.3c0.1,0.1,0.1,0.1,0.2,0.2c0.1,0.1,0.2,0.2,0.3,0.3c0.1,0.1,0.2,0.2,0.3,0.3\n\t\t\tc0,0,0,0,0,0c0,0.1,0.1,0.1,0.1,0.2c0.1,0.1,0.2,0.2,0.2,0.3c0.1,0.1,0.2,0.2,0.3,0.4c0,0,0.1,0.1,0.1,0.1\n\t\t\tc0.1,0.1,0.1,0.2,0.2,0.4c0.1,0.2,0.2,0.4,0.3,0.6c0.1,0.1,0.1,0.3,0.2,0.4c0,0,0,0,0,0c0.1,0.1,0.1,0.3,0.2,0.4\n\t\t\tc0,0.1,0.1,0.2,0.1,0.2c0,0.1,0.1,0.3,0.1,0.4c0,0,0,0.1,0,0.1c0.1,0.2,0.1,0.3,0.1,0.5c0,0,0,0,0,0c0.1,0.2,0.1,0.4,0.1,0.6\n\t\t\tc0,0.2,0.1,0.4,0.1,0.6c0.2,1.2,0.2,2.4,0,3.5c0,0.2-0.1,0.4-0.1,0.7c0,0.1-0.1,0.2-0.1,0.3l0,0.1l0,0c0,0.1,0,0.1-0.1,0.2\n\t\t\tc0,0.1,0,0.1-0.1,0.2v0l0,0.1c0,0.1-0.1,0.2-0.1,0.4c-0.1,0.2-0.1,0.3-0.2,0.5C49.1,99.4,49.1,99.5,49,99.7\n\t\t\tC49,99.7,49,99.7,49,99.7z M51.9,98.6L51.9,98.6c-0.6,1.5-1.6,2.6-2.8,3.3l0.2-0.2c0.1-0.1,0.2-0.2,0.3-0.4\n\t\t\tc0.1-0.1,0.2-0.2,0.2-0.3c0-0.1,0.1-0.1,0.1-0.2l0-0.1c0.1-0.1,0.2-0.3,0.2-0.4l0,0c0.1-0.2,0.2-0.3,0.2-0.5\n\t\t\tc0.1-0.2,0.2-0.4,0.2-0.5c0.1-0.2,0.1-0.4,0.2-0.5l0-0.1c0-0.1,0.1-0.3,0.1-0.5c0-0.1,0.1-0.2,0.1-0.4c0.1-0.2,0.1-0.5,0.2-0.7\n\t\t\tc0.2-1.3,0.2-2.6,0-3.9c0-0.2-0.1-0.3-0.1-0.5c0-0.1,0-0.2-0.1-0.3c0-0.2-0.1-0.3-0.1-0.5c0-0.2-0.1-0.4-0.2-0.5c0,0,0,0,0-0.1\n\t\t\tc0-0.2-0.1-0.3-0.2-0.5c0-0.1,0-0.1-0.1-0.2c-0.1-0.2-0.1-0.3-0.2-0.5c0,0,0,0,0-0.1c-0.1-0.2-0.1-0.3-0.2-0.5c0,0,0,0,0,0\n\t\t\tc-0.1-0.1-0.1-0.2-0.2-0.4c0-0.1-0.1-0.2-0.1-0.3c-0.1-0.3-0.3-0.5-0.5-0.7c-0.1-0.1-0.1-0.2-0.2-0.2c0-0.1-0.1-0.1-0.1-0.2\n\t\t\tc-0.1-0.1-0.1-0.2-0.2-0.2c-0.1-0.1-0.2-0.2-0.3-0.3c-0.1-0.1-0.2-0.2-0.3-0.3c0,0,0,0,0,0c-0.1-0.1-0.2-0.2-0.2-0.2\n\t\t\tc0,0-0.1-0.1-0.1-0.1c-0.1-0.1-0.1-0.1-0.2-0.2c-0.2-0.2-0.4-0.3-0.6-0.5c-0.1-0.1-0.2-0.1-0.3-0.2c0,0,0,0,0,0\n\t\t\tc-0.1-0.1-0.2-0.1-0.3-0.2c1.1,0.2,2.2,0.8,3.2,1.7c1.5,1.4,2.5,3.5,2.8,5.8C52.8,94.9,52.6,96.9,51.9,98.6z M82.2,98.4\n\t\t\tc-9.4,3.2-19.4,3.2-28.8,0c0.6-1.7,0.8-3.7,0.5-5.7c-0.4-2.6-1.5-4.9-3.2-6.5c-1.7-1.7-3.8-2.4-5.9-2.1l-2.4,0.4h0l0,0h0l-0.2,0\n\t\t\tl-0.1,0c0,0,0,0,0,0c0,0,0,0,0,0v0c1.8-11.9,2.2-14.9,2.3-15.3c0.1-0.5,1-0.9,1.6-1.1c0,0,0,0,0,0c1.6,1.1,10.1,6.8,21.9,6.8\n\t\t\ts20.4-5.6,21.9-6.8c0.6,0.2,1.5,0.6,1.6,1.1c0.1,0.4,0.6,3.4,2.3,15.3c0,0,0,0,0,0c0,0,0,0,0,0l-0.1,0l-0.3,0l0,0h0l0,0l-2.4-0.4\n\t\t\tc-2.1-0.3-4.2,0.4-5.9,2.1c-1.7,1.6-2.8,3.9-3.2,6.5C81.4,94.7,81.6,96.7,82.2,98.4z M83.6,98.6c-0.7-1.7-0.9-3.7-0.7-5.6\n\t\t\tc0.3-2.3,1.3-4.3,2.8-5.8c1-0.9,2-1.5,3.1-1.7c-0.1,0.1-0.3,0.2-0.4,0.3c0,0,0,0,0,0c-0.1,0.1-0.3,0.2-0.4,0.3c0,0,0,0,0,0\n\t\t\tc-0.1,0.1-0.3,0.2-0.4,0.3c-0.1,0.1-0.3,0.2-0.4,0.4S87,87,86.9,87.2c-0.1,0.1-0.2,0.3-0.4,0.4c-0.1,0.1-0.2,0.3-0.3,0.5\n\t\t\tc-0.2,0.3-0.4,0.6-0.6,1c0,0,0,0,0,0.1c-0.1,0.1-0.2,0.3-0.2,0.5c0,0,0,0,0,0c-0.1,0.2-0.2,0.3-0.2,0.5c0,0,0,0,0,0.1\n\t\t\tc-0.1,0.2-0.1,0.3-0.2,0.5c0,0.1,0,0.1-0.1,0.2c-0.1,0.2-0.1,0.3-0.2,0.5c0,0,0,0,0,0.1c-0.1,0.2-0.1,0.4-0.2,0.5\n\t\t\tc0,0.2-0.1,0.3-0.1,0.5c0,0.1,0,0.2-0.1,0.3c0,0.2-0.1,0.3-0.1,0.5c-0.2,1.3-0.2,2.7,0,3.9c0,0.2,0.1,0.5,0.2,0.7\n\t\t\tc0,0.1,0.1,0.2,0.1,0.3l0,0.1c0,0,0,0,0,0c0,0.1,0.1,0.2,0.1,0.4l0,0.1c0.1,0.2,0.1,0.4,0.2,0.5c0.1,0.2,0.2,0.4,0.2,0.5\n\t\t\tc0.1,0.2,0.2,0.3,0.3,0.5l0,0c0.1,0.1,0.2,0.3,0.2,0.4l0,0.1c0,0.1,0.1,0.1,0.1,0.1c0.1,0.1,0.2,0.2,0.2,0.3\n\t\t\tc0.1,0.1,0.2,0.3,0.3,0.4c0.1,0.1,0.1,0.1,0.2,0.2C85.3,101.2,84.3,100.1,83.6,98.6z M87.7,101.2c-0.1,0-0.1-0.1-0.2-0.2\n\t\t\tc-0.1-0.1-0.2-0.2-0.2-0.3c-0.1-0.1-0.2-0.2-0.2-0.3c-0.1-0.1-0.1-0.2-0.2-0.3c0,0,0-0.1-0.1-0.1l0-0.1c-0.1-0.1-0.1-0.2-0.2-0.3\n\t\t\tc0,0,0-0.1,0-0.1c-0.1-0.1-0.1-0.3-0.2-0.4c-0.1-0.1-0.1-0.3-0.2-0.5c0-0.1-0.1-0.2-0.1-0.4l0-0.1c0,0,0-0.1,0-0.1\n\t\t\tc0-0.1,0-0.1-0.1-0.2c0,0,0-0.1,0-0.1l0-0.1c0-0.1-0.1-0.2-0.1-0.3c-0.1-0.2-0.1-0.4-0.1-0.6c-0.1-0.6-0.2-1.2-0.2-1.8\n\t\t\tc0-0.6,0-1.1,0.1-1.7c0-0.2,0.1-0.4,0.1-0.6c0,0,0,0,0-0.1c0-0.2,0.1-0.3,0.1-0.5c0,0,0-0.1,0-0.1c0-0.2,0.1-0.3,0.1-0.5\n\t\t\tc0-0.1,0.1-0.3,0.1-0.4c0,0,0-0.1,0.1-0.1c0.1-0.1,0.1-0.3,0.2-0.4c0-0.1,0.1-0.2,0.1-0.2c0.2-0.4,0.4-0.8,0.6-1.1\n\t\t\tc0-0.1,0.1-0.1,0.1-0.2c0.1-0.1,0.1-0.2,0.2-0.3c0.1-0.1,0.1-0.2,0.2-0.3c0.1-0.1,0.1-0.2,0.2-0.3c0.1-0.1,0.2-0.2,0.2-0.3\n\t\t\tc0.1-0.1,0.2-0.2,0.2-0.2c0.1-0.1,0.2-0.2,0.2-0.2c0.1-0.1,0.2-0.1,0.2-0.2c0.1-0.1,0.2-0.1,0.2-0.2c0,0,0,0,0.1,0\n\t\t\tc0.1-0.1,0.2-0.1,0.2-0.2c0.2-0.1,0.4-0.2,0.5-0.3c0.1,0,0.1-0.1,0.2-0.1c0,0,0,0,0,0h0c-0.1,0.1-0.2,0.2-0.4,0.3\n\t\t\tc-0.1,0.1-0.2,0.2-0.3,0.3c-0.3,0.3-0.6,0.7-0.9,1c-0.1,0.1-0.1,0.1-0.1,0.2c-0.3,0.4-0.5,0.8-0.8,1.2c-0.1,0.1-0.1,0.2-0.2,0.4\n\t\t\tc-0.1,0.2-0.2,0.4-0.3,0.6c-0.1,0.1-0.1,0.3-0.2,0.4c-0.1,0.1-0.1,0.3-0.2,0.5c-0.1,0.2-0.1,0.3-0.1,0.5c0,0.1,0,0.2-0.1,0.2\n\t\t\tc0,0.1-0.1,0.3-0.1,0.4c0,0.2-0.1,0.4-0.1,0.5c0,0.2-0.1,0.4-0.1,0.5c-0.2,1.3-0.2,2.7,0,4c0,0.2,0.1,0.4,0.1,0.6\n\t\t\tc0,0.2,0.1,0.4,0.2,0.6c0,0.2,0.1,0.3,0.1,0.5c0,0.1,0.1,0.3,0.2,0.4c0.1,0.2,0.1,0.3,0.2,0.5c0,0,0,0,0,0\n\t\t\tc0.1,0.1,0.1,0.3,0.2,0.4c0,0,0,0,0,0c0.1,0.1,0.2,0.3,0.2,0.4C87.5,101,87.6,101.1,87.7,101.2C87.7,101.2,87.7,101.2,87.7,101.2z\n\t\t\t M90.9,102.5c-0.1-0.1-0.2-0.1-0.3-0.2c-0.2-0.1-0.4-0.3-0.6-0.5c-0.1-0.1-0.1-0.1-0.2-0.2c0,0,0,0-0.1-0.1\n\t\t\tc-0.1-0.1-0.1-0.1-0.2-0.2c0,0,0,0-0.1-0.1c-0.1-0.1-0.2-0.2-0.2-0.3c-0.1-0.1-0.2-0.2-0.2-0.3c-0.2-0.2-0.3-0.4-0.4-0.7\n\t\t\tc-0.1-0.1-0.1-0.2-0.2-0.4c-0.1-0.1-0.1-0.2-0.2-0.4c0,0,0,0,0,0C88,99.1,88,99,87.9,98.9c-0.1-0.1-0.1-0.3-0.1-0.4c0,0,0,0,0,0\n\t\t\tc0-0.1-0.1-0.2-0.1-0.4c0-0.1,0-0.1,0-0.2c0-0.1-0.1-0.2-0.1-0.3c0-0.1-0.1-0.3-0.1-0.5c-0.2-1.2-0.2-2.4,0-3.6\n\t\t\tc0-0.2,0.1-0.5,0.1-0.7c0-0.1,0.1-0.2,0.1-0.4c0-0.1,0.1-0.2,0.1-0.3c0-0.1,0-0.2,0.1-0.3c0-0.2,0.1-0.3,0.2-0.5\n\t\t\tc0-0.1,0.1-0.2,0.1-0.3c0-0.1,0.1-0.2,0.1-0.3c0-0.1,0.1-0.2,0.1-0.3c0.1-0.2,0.2-0.4,0.3-0.6c0-0.1,0.1-0.2,0.2-0.3c0,0,0,0,0,0\n\t\t\tc0.1-0.2,0.2-0.4,0.3-0.5c0.1-0.1,0.1-0.2,0.2-0.3c0.1-0.1,0.1-0.1,0.2-0.2c0,0,0.1-0.1,0.1-0.1c0.1-0.1,0.1-0.2,0.2-0.3\n\t\t\tc0.1-0.1,0.2-0.2,0.2-0.2c0.1-0.1,0.2-0.2,0.2-0.2c0.1-0.1,0.2-0.2,0.2-0.2c0.3-0.2,0.5-0.4,0.8-0.6c0.1,0,0.1-0.1,0.2-0.1\n\t\t\tc0.1-0.1,0.2-0.1,0.3-0.2c0.1-0.1,0.2-0.1,0.3-0.1c0.2-0.1,0.4-0.2,0.5-0.2c0,0,0,0,0,0c0.1,0,0.2-0.1,0.3-0.1\n\t\t\tc0.1,0,0.2-0.1,0.3-0.1c0,0,0,0,0.1,0v0c0,0,0,0,0,0l0,0c0,0-0.1,0-0.1,0.1c-0.1,0.1-0.2,0.1-0.2,0.2c0,0-0.1,0-0.1,0.1\n\t\t\tc-0.1,0.1-0.2,0.1-0.2,0.2c-0.1,0-0.1,0.1-0.2,0.1c-0.1,0.1-0.2,0.1-0.2,0.2C92.2,87,92.1,87,92,87.1c0,0-0.1,0.1-0.1,0.1\n\t\t\tc-0.1,0.1-0.1,0.1-0.2,0.2c-0.1,0.1-0.2,0.2-0.3,0.3c-0.1,0.1-0.1,0.2-0.2,0.2c-0.1,0.2-0.3,0.3-0.4,0.5c-0.1,0.2-0.2,0.3-0.4,0.5\n\t\t\tc-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.2-0.2,0.4-0.3,0.6c0,0.1-0.1,0.2-0.1,0.3c-0.1,0.1-0.1,0.2-0.1,0.3\n\t\t\tc0,0.1-0.1,0.2-0.1,0.3c0,0,0,0,0,0.1c0,0,0,0,0,0c-0.1,0.2-0.2,0.4-0.2,0.6c-0.1,0.2-0.1,0.4-0.2,0.7c0,0.1-0.1,0.2-0.1,0.3\n\t\t\tc0,0.1-0.1,0.2-0.1,0.3c0,0.1,0,0.2-0.1,0.3c0,0,0,0,0,0.1c0,0.1,0,0.2-0.1,0.3c-0.1,0.8-0.2,1.6-0.1,2.3c0,0.4,0.1,0.8,0.1,1.2\n\t\t\tc0,0.2,0.1,0.4,0.1,0.6c0,0.2,0.1,0.4,0.1,0.6c0,0.2,0.1,0.4,0.2,0.6c0.1,0.2,0.1,0.4,0.2,0.5c0,0,0,0,0,0\n\t\t\tc0.1,0.2,0.1,0.3,0.2,0.5c0.1,0.2,0.2,0.3,0.2,0.5c0.2,0.3,0.4,0.6,0.6,0.9c0.1,0.1,0.2,0.3,0.3,0.4\n\t\t\tC90.6,102.2,90.7,102.3,90.9,102.5C90.9,102.5,90.9,102.5,90.9,102.5C90.9,102.5,90.9,102.5,90.9,102.5L90.9,102.5z M102.7,95.5\n\t\t\tl0,0.3c-0.2,1.6-0.8,3.1-1.7,4.4c-0.2,0.2-0.3,0.4-0.4,0.6c-0.2,0.3-0.4,0.5-0.7,0.8c0,0,0,0-0.1,0.1l-0.2,0.2\n\t\t\tc-0.2,0.2-0.5,0.4-0.8,0.6c0,0,0,0,0,0c-0.2,0.1-0.3,0.2-0.5,0.3c-0.2,0.1-0.4,0.2-0.6,0.3h0c-0.2,0.1-0.4,0.2-0.6,0.2\n\t\t\tc-0.7,0.2-1.4,0.3-2.2,0.2l0,0c0,0-0.1,0-0.1,0c-0.1,0-0.1,0-0.2,0c-0.1,0-0.1,0-0.2-0.1c-0.1,0-0.2,0-0.2-0.1c0,0,0,0-0.1,0\n\t\t\tc-0.1,0-0.3-0.1-0.4-0.2c-0.1,0-0.1-0.1-0.2-0.1c-0.1-0.1-0.3-0.2-0.4-0.2h0c-0.1-0.1-0.2-0.1-0.3-0.2c0,0,0,0-0.1,0\n\t\t\tc-0.1-0.1-0.2-0.2-0.3-0.3c-0.1-0.1-0.2-0.2-0.3-0.3c0,0,0,0-0.1-0.1c-0.1-0.1-0.2-0.2-0.3-0.3c0,0,0,0,0,0\n\t\t\tc-0.1-0.1-0.2-0.2-0.3-0.3c-0.2-0.2-0.4-0.5-0.5-0.8c-0.1-0.1-0.2-0.3-0.2-0.4c0-0.1-0.1-0.2-0.1-0.3c0-0.1-0.1-0.1-0.1-0.2\n\t\t\tc0-0.1-0.1-0.2-0.1-0.3c0,0,0-0.1-0.1-0.2c0-0.1-0.1-0.2-0.1-0.3c0-0.1,0-0.1-0.1-0.2c0-0.1-0.1-0.2-0.1-0.4c0-0.1,0-0.1,0-0.2\n\t\t\tc0-0.1-0.1-0.3-0.1-0.4c0,0,0-0.1,0-0.1c0-0.1-0.1-0.3-0.1-0.5c0,0,0,0,0,0c-0.1-0.3-0.1-0.7-0.1-1.1c0-0.7,0-1.4,0.1-2.1\n\t\t\tc0.1-0.4,0.1-0.8,0.3-1.2c0-0.2,0.1-0.4,0.2-0.6c0.1-0.2,0.1-0.4,0.2-0.6c0.1-0.2,0.1-0.4,0.2-0.5c0.1-0.2,0.2-0.4,0.3-0.5\n\t\t\tc0.2-0.3,0.4-0.7,0.6-1c0.1-0.2,0.2-0.3,0.3-0.5c0.1-0.1,0.1-0.1,0.2-0.2c0.1-0.1,0.1-0.1,0.2-0.2c0.1-0.1,0.1-0.1,0.2-0.2\n\t\t\tc0.1-0.1,0.1-0.1,0.2-0.2c0.1-0.1,0.3-0.3,0.4-0.4c0.1-0.1,0.1-0.1,0.2-0.1c0.1-0.1,0.3-0.2,0.4-0.3c0.1,0,0.1-0.1,0.2-0.1\n\t\t\tc0.3-0.2,0.6-0.4,0.9-0.5h0c0.1,0,0.2-0.1,0.3-0.1h0c0.1,0,0.2-0.1,0.3-0.1l0.1,0c0.7-0.2,1.3-0.2,2-0.1l0,0h0l0,0\n\t\t\tc1.4,0.2,2.7,1.1,3.7,2.5c0.1,0.2,0.2,0.4,0.3,0.5C102.6,91.2,102.9,93.3,102.7,95.5z");
    			add_location(path0, file$3, 11, 2, 322);
    			attr_dev(path1, "class", "st0 svelte-14l8fvi");
    			attr_dev(path1, "d", "M81.2,43.2c-0.2-0.4-0.3-0.9-0.5-1.3C80,40.5,79,39.2,77.9,38c-2.7-2.7-6.3-4.2-10.1-4.2\n\t\t\tc-5.7,0-10.6,3.3-12.9,8.1c-0.2,0.4-0.4,0.9-0.5,1.3c-0.2,0.6-0.4,1.2-0.5,1.9c3.6,4,8.7,6.2,14,6.2s10.4-2.3,14-6.2\n\t\t\tC81.6,44.5,81.4,43.9,81.2,43.2z M64,49.2c-0.4,0-0.8-1.9-0.8-4.1c0-0.6,0-1.3,0.1-1.8c0-0.5,0.1-0.9,0.2-1.3c0.1-0.6,0.3-1,0.5-1\n\t\t\tc0.2,0,0.4,0.4,0.5,1c0.1,0.4,0.1,0.8,0.2,1.3c0.1,0.5,0.1,1.2,0.1,1.8C64.8,47.3,64.5,49.2,64,49.2z M71.5,49.2\n\t\t\tc-0.4,0-0.8-1.9-0.8-4.1c0-0.6,0-1.3,0.1-1.8c0-0.5,0.1-0.9,0.2-1.3c0.1-0.6,0.3-1,0.5-1c0.2,0,0.4,0.4,0.5,1\n\t\t\tc0.1,0.4,0.1,0.8,0.2,1.3c0.1,0.5,0.1,1.2,0.1,1.8C72.2,47.3,71.9,49.2,71.5,49.2z");
    			add_location(path1, file$3, 130, 2, 14510);
    			add_location(g0, file$3, 10, 1, 316);
    			attr_dev(path2, "class", "st1 svelte-14l8fvi");
    			attr_dev(path2, "d", "M64.8,45c0,2.3-0.4,4.1-0.8,4.1s-0.8-1.9-0.8-4.1c0-0.6,0-1.3,0.1-1.8c0-0.5,0.1-0.9,0.2-1.3\n\t\t\t\tc0.1-0.6,0.3-1,0.5-1c0.2,0,0.4,0.4,0.5,1c0.1,0.4,0.1,0.8,0.2,1.3C64.8,43.8,64.8,44.4,64.8,45z");
    			add_location(path2, file$3, 139, 3, 15189);
    			add_location(g1, file$3, 138, 2, 15182);
    			attr_dev(path3, "class", "st1 svelte-14l8fvi");
    			attr_dev(path3, "d", "M72.2,45c0,2.3-0.4,4.1-0.8,4.1s-0.8-1.9-0.8-4.1c0-0.6,0-1.3,0.1-1.8c0-0.5,0.1-0.9,0.2-1.3\n\t\t\t\tc0.1-0.6,0.3-1,0.5-1c0.2,0,0.4,0.4,0.5,1c0.1,0.4,0.1,0.8,0.2,1.3C72.2,43.8,72.2,44.4,72.2,45z");
    			add_location(path3, file$3, 143, 3, 15417);
    			add_location(g2, file$3, 142, 2, 15410);
    			add_location(g3, file$3, 137, 1, 15176);
    			attr_dev(path4, "d", "M93.4,84.5l-0.3,0l0.1,0C93.3,84.5,93.4,84.5,93.4,84.5z");
    			add_location(path4, file$3, 149, 3, 15656);
    			add_location(g4, file$3, 148, 2, 15649);
    			attr_dev(path5, "d", "M93.3,86.1C93.3,86.1,93.3,86.1,93.3,86.1L93.3,86.1C93.3,86.1,93.3,86.1,93.3,86.1L93.3,86.1\n\t\t\t\tC93.3,86.1,93.3,86.1,93.3,86.1z M90.9,102.5c-0.1-0.1-0.2-0.1-0.3-0.2C90.7,102.4,90.8,102.4,90.9,102.5L90.9,102.5\n\t\t\t\tC90.9,102.5,90.9,102.5,90.9,102.5z");
    			add_location(path5, file$3, 152, 3, 15739);
    			add_location(g5, file$3, 151, 2, 15732);
    			attr_dev(path6, "class", "st2 svelte-14l8fvi");
    			attr_dev(path6, "d", "M88.9,85.4c-0.1,0.1-0.3,0.2-0.4,0.3c0,0,0,0,0,0c-0.1,0.1-0.3,0.2-0.4,0.3c0,0,0,0,0,0\n\t\t\t\tc-0.1,0.1-0.3,0.2-0.4,0.3c-0.1,0.1-0.3,0.2-0.4,0.4S87,87,86.9,87.2c-0.1,0.1-0.2,0.3-0.4,0.4c-0.1,0.1-0.2,0.3-0.3,0.5\n\t\t\t\tc-0.2,0.3-0.4,0.6-0.6,1c0,0,0,0,0,0.1c-0.1,0.1-0.2,0.3-0.2,0.5c0,0,0,0,0,0c-0.1,0.2-0.2,0.3-0.2,0.5c0,0,0,0,0,0.1\n\t\t\t\tc-0.1,0.2-0.1,0.3-0.2,0.5c0,0.1,0,0.1-0.1,0.2c-0.1,0.2-0.1,0.3-0.2,0.5c0,0,0,0,0,0.1c-0.1,0.2-0.1,0.4-0.2,0.5\n\t\t\t\tc0,0.2-0.1,0.3-0.1,0.5c0,0.1,0,0.2-0.1,0.3c0,0.2-0.1,0.3-0.1,0.5c-0.2,1.3-0.2,2.7,0,3.9c0,0.2,0.1,0.5,0.2,0.7\n\t\t\t\tc0,0.1,0.1,0.2,0.1,0.3l0,0.1c0,0,0,0,0,0c0,0.1,0.1,0.2,0.1,0.4l0,0.1c0.1,0.2,0.1,0.4,0.2,0.5c0.1,0.2,0.2,0.4,0.2,0.5\n\t\t\t\tc0.1,0.2,0.2,0.3,0.3,0.5l0,0c0.1,0.1,0.2,0.3,0.2,0.4l0,0.1c0,0.1,0.1,0.1,0.1,0.1c0.1,0.1,0.2,0.2,0.2,0.3\n\t\t\t\tc0.1,0.1,0.2,0.3,0.3,0.4c0.1,0.1,0.1,0.1,0.2,0.2c-1.2-0.6-2.2-1.8-2.8-3.3c-0.7-1.7-0.9-3.7-0.7-5.6c0.3-2.3,1.3-4.3,2.8-5.8\n\t\t\t\tC86.7,86.2,87.8,85.6,88.9,85.4z");
    			add_location(path6, file$3, 157, 3, 16014);
    			attr_dev(path7, "d", "M89.2,86.8c0.2-0.1,0.4-0.2,0.5-0.3C89.6,86.5,89.4,86.7,89.2,86.8z M89.8,86.4c0.1,0,0.1-0.1,0.2-0.1h0c0,0,0,0,0,0\n\t\t\t\tC89.9,86.4,89.8,86.4,89.8,86.4z");
    			add_location(path7, file$3, 166, 3, 16986);
    			add_location(g6, file$3, 156, 2, 16007);
    			attr_dev(path8, "d", "M90.2,92.8c-0.1,0.4-0.2,0.8-0.3,1.2c-0.1,0.7-0.1,1.4-0.1,2.1c0,0.4,0,0.7,0.1,1.1c0-0.3-0.1-0.7-0.1-1.1\n\t\t\t\tc0-0.7,0-1.4,0.1-2.1C90,93.6,90.1,93.2,90.2,92.8z M90.2,92.8c-0.1,0.4-0.2,0.8-0.3,1.2c-0.1,0.7-0.1,1.4-0.1,2.1\n\t\t\t\tc0,0.4,0,0.7,0.1,1.1c0-0.3-0.1-0.7-0.1-1.1c0-0.7,0-1.4,0.1-2.1C90,93.6,90.1,93.2,90.2,92.8z");
    			add_location(path8, file$3, 170, 3, 17163);
    			add_location(g7, file$3, 169, 2, 17156);
    			attr_dev(path9, "class", "st2 svelte-14l8fvi");
    			attr_dev(path9, "d", "M93.3,86.1L93.3,86.1C93.3,86.1,93.3,86.1,93.3,86.1L93.3,86.1c0,0-0.1,0-0.1,0.1c-0.1,0.1-0.2,0.1-0.2,0.2\n\t\t\t\tc0,0-0.1,0-0.1,0.1c-0.1,0.1-0.2,0.1-0.2,0.2c-0.1,0-0.1,0.1-0.2,0.1c-0.1,0.1-0.2,0.1-0.2,0.2C92.2,87,92.1,87,92,87.1\n\t\t\t\tc0,0-0.1,0.1-0.1,0.1c-0.1,0.1-0.1,0.1-0.2,0.2c-0.1,0.1-0.2,0.2-0.3,0.3c-0.1,0.1-0.1,0.2-0.2,0.2c-0.1,0.2-0.3,0.3-0.4,0.5\n\t\t\t\tc-0.1,0.2-0.2,0.3-0.4,0.5c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.2-0.2,0.4-0.3,0.6c0,0.1-0.1,0.2-0.1,0.3\n\t\t\t\tc-0.1,0.1-0.1,0.2-0.1,0.3c0,0.1-0.1,0.2-0.1,0.3c0,0,0,0,0,0.1c0,0,0,0,0,0c-0.1,0.2-0.2,0.4-0.2,0.6c-0.1,0.2-0.1,0.4-0.2,0.7\n\t\t\t\tc0,0.1-0.1,0.2-0.1,0.3c0,0.1-0.1,0.2-0.1,0.3c0,0.1,0,0.2-0.1,0.3c0,0,0,0,0,0.1c0,0.1,0,0.2-0.1,0.3c-0.1,0.8-0.2,1.6-0.1,2.3\n\t\t\t\tc0,0.4,0.1,0.8,0.1,1.2c0,0.2,0.1,0.4,0.1,0.6c0,0.2,0.1,0.4,0.1,0.6c0,0.2,0.1,0.4,0.2,0.6c0.1,0.2,0.1,0.4,0.2,0.5c0,0,0,0,0,0\n\t\t\t\tc0.1,0.2,0.1,0.3,0.2,0.5c0.1,0.2,0.2,0.3,0.2,0.5c0.2,0.3,0.4,0.6,0.6,0.9c0.1,0.1,0.2,0.3,0.3,0.4c0.1,0.1,0.2,0.3,0.3,0.4\n\t\t\t\tc0,0,0,0,0,0c0,0,0,0,0,0v0c-0.1-0.1-0.2-0.1-0.3-0.2c-0.2-0.1-0.4-0.3-0.6-0.5c-0.1-0.1-0.1-0.1-0.2-0.2c0,0,0,0-0.1-0.1\n\t\t\t\tc-0.1-0.1-0.1-0.1-0.2-0.2c0,0,0,0-0.1-0.1c-0.1-0.1-0.2-0.2-0.2-0.3c-0.1-0.1-0.2-0.2-0.2-0.3c-0.2-0.2-0.3-0.4-0.4-0.7\n\t\t\t\tc-0.1-0.1-0.1-0.2-0.2-0.4c-0.1-0.1-0.1-0.2-0.2-0.4c0,0,0,0,0,0C88,99.1,88,99,87.9,98.9c-0.1-0.1-0.1-0.3-0.1-0.4c0,0,0,0,0,0\n\t\t\t\tc0-0.1-0.1-0.2-0.1-0.4c0-0.1,0-0.1,0-0.2c0-0.1-0.1-0.2-0.1-0.3c0-0.1-0.1-0.3-0.1-0.5c-0.2-1.2-0.2-2.4,0-3.6\n\t\t\t\tc0-0.2,0.1-0.5,0.1-0.7c0-0.1,0.1-0.2,0.1-0.4c0-0.1,0.1-0.2,0.1-0.3c0-0.1,0-0.2,0.1-0.3c0-0.2,0.1-0.3,0.2-0.5\n\t\t\t\tc0-0.1,0.1-0.2,0.1-0.3c0-0.1,0.1-0.2,0.1-0.3c0-0.1,0.1-0.2,0.1-0.3c0.1-0.2,0.2-0.4,0.3-0.6c0-0.1,0.1-0.2,0.2-0.3c0,0,0,0,0,0\n\t\t\t\tc0.1-0.2,0.2-0.4,0.3-0.5c0.1-0.1,0.1-0.2,0.2-0.3c0.1-0.1,0.1-0.1,0.2-0.2c0,0,0.1-0.1,0.1-0.1c0.1-0.1,0.1-0.2,0.2-0.3\n\t\t\t\tc0.1-0.1,0.2-0.2,0.2-0.2c0.1-0.1,0.2-0.2,0.2-0.2c0.1-0.1,0.2-0.2,0.2-0.2c0.3-0.2,0.5-0.4,0.8-0.6c0.1,0,0.1-0.1,0.2-0.1\n\t\t\t\tc0.1-0.1,0.2-0.1,0.3-0.2c0.1-0.1,0.2-0.1,0.3-0.1c0.2-0.1,0.4-0.2,0.5-0.2c0,0,0,0,0,0c0.1,0,0.2-0.1,0.3-0.1\n\t\t\t\tC93.1,86.2,93.2,86.1,93.3,86.1C93.3,86.1,93.3,86.1,93.3,86.1z");
    			add_location(path9, file$3, 175, 3, 17505);
    			attr_dev(path10, "d", "M88.7,93.5c0,0.1,0,0.2-0.1,0.3c-0.1,0.8-0.2,1.6-0.1,2.3c0,0.4,0.1,0.8,0.1,1.2c-0.1-0.4-0.1-0.8-0.1-1.2\n\t\t\t\tc0-0.8,0-1.6,0.1-2.3C88.7,93.7,88.7,93.6,88.7,93.5z M89.7,100.7c0.2,0.3,0.3,0.6,0.6,0.9C90,101.3,89.8,101,89.7,100.7z");
    			add_location(path10, file$3, 193, 3, 19664);
    			add_location(g8, file$3, 174, 2, 17498);
    			add_location(g9, file$3, 147, 1, 15643);
    			attr_dev(path11, "d", "M42.3,84.5l-0.2,0c0,0,0.1,0,0.1,0L42.3,84.5z");
    			add_location(path11, file$3, 199, 3, 19928);
    			add_location(g10, file$3, 198, 2, 19921);
    			attr_dev(path12, "d", "M42.2,86.1L42.2,86.1C42.2,86.1,42.2,86.1,42.2,86.1C42.2,86.1,42.2,86.1,42.2,86.1z M44.7,102.5c0.1,0,0.2-0.1,0.3-0.2\n\t\t\t\tC44.9,102.3,44.8,102.4,44.7,102.5z M44.6,102.5C44.6,102.5,44.6,102.5,44.6,102.5C44.6,102.5,44.6,102.5,44.6,102.5L44.6,102.5z\n\t\t\t\t M45.6,86.4C45.6,86.4,45.6,86.3,45.6,86.4C45.6,86.4,45.6,86.4,45.6,86.4C45.6,86.4,45.6,86.4,45.6,86.4z");
    			add_location(path12, file$3, 202, 3, 20001);
    			attr_dev(path13, "d", "M37.9,85.9l-0.1,0L37.9,85.9L37.9,85.9z");
    			add_location(path13, file$3, 205, 3, 20368);
    			add_location(g11, file$3, 201, 2, 19994);
    			attr_dev(path14, "class", "st2 svelte-14l8fvi");
    			attr_dev(path14, "d", "M51.9,98.6L51.9,98.6c-0.6,1.5-1.6,2.6-2.8,3.3l0.2-0.2c0.1-0.1,0.2-0.2,0.3-0.4c0.1-0.1,0.2-0.2,0.2-0.3\n\t\t\t\tc0-0.1,0.1-0.1,0.1-0.2l0-0.1c0.1-0.1,0.2-0.3,0.2-0.4l0,0c0.1-0.2,0.2-0.3,0.2-0.5c0.1-0.2,0.2-0.4,0.2-0.5\n\t\t\t\tc0.1-0.2,0.1-0.4,0.2-0.5l0-0.1c0-0.1,0.1-0.3,0.1-0.5c0-0.1,0.1-0.2,0.1-0.4c0.1-0.2,0.1-0.5,0.2-0.7c0.2-1.3,0.2-2.6,0-3.9\n\t\t\t\tc0-0.2-0.1-0.3-0.1-0.5c0-0.1,0-0.2-0.1-0.3c0-0.2-0.1-0.3-0.1-0.5c0-0.2-0.1-0.4-0.2-0.5c0,0,0,0,0-0.1c0-0.2-0.1-0.3-0.2-0.5\n\t\t\t\tc0-0.1,0-0.1-0.1-0.2c-0.1-0.2-0.1-0.3-0.2-0.5c0,0,0,0,0-0.1c-0.1-0.2-0.1-0.3-0.2-0.5c0,0,0,0,0,0c-0.1-0.1-0.1-0.2-0.2-0.4\n\t\t\t\tc0-0.1-0.1-0.2-0.1-0.3c-0.1-0.3-0.3-0.5-0.5-0.7c-0.1-0.1-0.1-0.2-0.2-0.2c0-0.1-0.1-0.1-0.1-0.2c-0.1-0.1-0.1-0.2-0.2-0.2\n\t\t\t\tc-0.1-0.1-0.2-0.2-0.3-0.3c-0.1-0.1-0.2-0.2-0.3-0.3c0,0,0,0,0,0c-0.1-0.1-0.2-0.2-0.2-0.2c0,0-0.1-0.1-0.1-0.1\n\t\t\t\tc-0.1-0.1-0.1-0.1-0.2-0.2c-0.2-0.2-0.4-0.3-0.6-0.5c-0.1-0.1-0.2-0.1-0.3-0.2c0,0,0,0,0,0c-0.1-0.1-0.2-0.1-0.3-0.2\n\t\t\t\tc1.1,0.2,2.2,0.8,3.2,1.7c1.5,1.4,2.5,3.5,2.8,5.8C52.8,94.9,52.6,96.9,51.9,98.6z");
    			add_location(path14, file$3, 208, 3, 20435);
    			attr_dev(path15, "d", "M47.2,85.9c0.2,0.2,0.4,0.3,0.6,0.5C47.6,86.2,47.4,86,47.2,85.9z M47.2,85.9c0.2,0.2,0.4,0.3,0.6,0.5\n\t\t\t\tC47.6,86.2,47.4,86,47.2,85.9z");
    			add_location(path15, file$3, 217, 3, 21488);
    			add_location(g12, file$3, 207, 2, 20428);
    			attr_dev(path16, "d", "M37.9,85.9l-0.1,0L37.9,85.9L37.9,85.9z M35,102.8L35,102.8C35,102.8,35,102.8,35,102.8L35,102.8z");
    			add_location(path16, file$3, 221, 3, 21649);
    			add_location(g13, file$3, 220, 2, 21642);
    			attr_dev(path17, "class", "st2 svelte-14l8fvi");
    			attr_dev(path17, "d", "M44.6,102.5C44.6,102.5,44.6,102.5,44.6,102.5C44.6,102.5,44.6,102.5,44.6,102.5L44.6,102.5z");
    			add_location(path17, file$3, 224, 3, 21772);
    			attr_dev(path18, "class", "st2 svelte-14l8fvi");
    			attr_dev(path18, "d", "M48.2,95.3c0,0.2,0,0.3,0,0.5c0,0.1,0,0.2,0,0.4c0,0,0,0.1,0,0.1l0,0.1c0,0.1,0,0.2,0,0.3\n\t\t\t\tc0,0.1,0,0.2-0.1,0.4l0,0.1c0,0.1,0,0.2-0.1,0.4l0,0.1c0,0.1,0,0.1-0.1,0.2c0,0.1,0,0.2-0.1,0.2l0,0.2c0,0.2-0.1,0.3-0.1,0.5\n\t\t\t\tc0,0.1-0.1,0.3-0.2,0.5c0,0,0,0,0,0c-0.1,0.1-0.1,0.3-0.2,0.4l0,0.1c0,0.1-0.1,0.2-0.2,0.3l0,0.1c0,0,0,0,0,0.1l-0.1,0.1\n\t\t\t\tc-0.1,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-0.2,0.3-0.3,0.4c0,0-0.1,0.1-0.1,0.2c0,0.1-0.1,0.1-0.1,0.2c-0.2,0.3-0.5,0.5-0.8,0.8\n\t\t\t\tc0,0-0.1,0.1-0.2,0.1c0,0-0.1,0.1-0.2,0.1c-0.1,0-0.1,0.1-0.2,0.1c-0.1,0.1-0.2,0.1-0.3,0.2c0,0,0,0,0,0c0,0,0,0,0,0\n\t\t\t\tc0.1-0.1,0.2-0.3,0.3-0.4c0.1-0.1,0.2-0.3,0.3-0.4c0,0,0,0,0,0c0.1-0.1,0.2-0.3,0.3-0.4c0.1-0.2,0.2-0.3,0.3-0.5c0,0,0,0,0,0\n\t\t\t\tc0.1-0.1,0.1-0.3,0.2-0.4c0.1-0.2,0.2-0.4,0.2-0.6c0.1-0.4,0.2-0.7,0.3-1.1c0-0.2,0.1-0.4,0.1-0.6c0-0.2,0.1-0.3,0.1-0.5\n\t\t\t\tc0-0.1,0-0.1,0-0.2c0-0.1,0-0.3,0.1-0.4c0,0,0-0.1,0-0.1c0-0.2,0-0.4,0-0.6c0-0.8,0-1.6-0.1-2.3c0-0.2-0.1-0.4-0.1-0.6\n\t\t\t\tc0-0.1-0.1-0.3-0.1-0.4c0-0.1,0-0.2-0.1-0.3c0-0.1-0.1-0.3-0.1-0.4c0,0,0-0.1,0-0.1c-0.1-0.2-0.1-0.4-0.2-0.5c0,0,0-0.1,0-0.1\n\t\t\t\tc-0.1-0.2-0.1-0.3-0.2-0.5c0,0,0,0,0,0c-0.1-0.2-0.2-0.3-0.2-0.5c-0.1-0.1-0.1-0.3-0.2-0.4c0-0.1-0.1-0.1-0.1-0.2\n\t\t\t\tc-0.1-0.1-0.1-0.2-0.2-0.4c-0.2-0.4-0.5-0.7-0.7-1.1c-0.1-0.1-0.2-0.3-0.3-0.4c-0.1-0.2-0.3-0.3-0.4-0.5\n\t\t\t\tc-0.1-0.1-0.2-0.2-0.3-0.3c0,0,0,0,0,0c-0.1-0.1-0.3-0.2-0.4-0.3c0,0,0,0,0,0c-0.1-0.1-0.3-0.2-0.4-0.3c-0.1-0.1-0.3-0.2-0.4-0.3\n\t\t\t\tv0c0,0,0,0,0,0c0.2,0,0.4,0.1,0.5,0.1c0.1,0,0.1,0,0.2,0.1c0.1,0,0.2,0.1,0.3,0.1c0.1,0,0.2,0.1,0.2,0.1c0.2,0.1,0.3,0.2,0.5,0.3\n\t\t\t\tc0.1,0,0.2,0.1,0.2,0.2c0.2,0.1,0.3,0.2,0.5,0.3c0.1,0.1,0.2,0.1,0.2,0.2c0.1,0.1,0.2,0.2,0.3,0.3c0.1,0.1,0.1,0.1,0.2,0.2\n\t\t\t\tc0.1,0.1,0.2,0.2,0.2,0.2s0.1,0.2,0.2,0.3c0,0.1,0.1,0.1,0.1,0.2c0.1,0.1,0.1,0.1,0.1,0.2c0.1,0.1,0.1,0.2,0.2,0.3\n\t\t\t\tc0.1,0.2,0.2,0.3,0.3,0.5c0.2,0.3,0.3,0.6,0.5,0.9c0,0.1,0.1,0.2,0.1,0.2c0.1,0.1,0.1,0.3,0.2,0.4c0,0.1,0.1,0.2,0.1,0.3\n\t\t\t\tc0,0.1,0.1,0.2,0.1,0.3c0.1,0.3,0.2,0.7,0.3,1c0.1,0.2,0.1,0.5,0.1,0.7C48.2,94.1,48.2,94.7,48.2,95.3z");
    			add_location(path18, file$3, 225, 3, 21889);
    			attr_dev(path19, "d", "M46.3,99.6c0.1-0.4,0.2-0.7,0.3-1.1C46.5,98.9,46.4,99.3,46.3,99.6z");
    			add_location(path19, file$3, 242, 3, 23919);
    			add_location(g14, file$3, 223, 2, 21765);
    			attr_dev(path20, "d", "M37.9,103.1c0,0-0.1,0-0.1-0.1v0C37.8,103.1,37.8,103.1,37.9,103.1z");
    			add_location(path20, file$3, 245, 3, 24013);
    			add_location(g15, file$3, 244, 2, 24006);
    			attr_dev(path21, "d", "M38.4,96.8c-0.7,0-1.2-0.8-1.2-1.9c0-1.1,0.5-1.9,1.2-1.9s1.2,0.8,1.2,1.9C39.6,96,39.1,96.8,38.4,96.8z");
    			add_location(path21, file$3, 248, 3, 24107);
    			add_location(g16, file$3, 247, 2, 24100);
    			attr_dev(path22, "d", "M97.1,96.8c-0.7,0-1.2-0.8-1.2-1.9c0-1.1,0.5-1.9,1.2-1.9s1.2,0.8,1.2,1.9C98.3,96,97.8,96.8,97.1,96.8z");
    			add_location(path22, file$3, 251, 3, 24236);
    			add_location(g17, file$3, 250, 2, 24229);
    			add_location(g18, file$3, 197, 1, 19915);
    			add_location(g19, file$3, 9, 0, 311);
    			attr_dev(path23, "d", "M40.5,22.4V12.2H38v-1.3h7.6v1.3h-2.5v10.2C43.1,22.4,40.5,22.4,40.5,22.4z");
    			add_location(path23, file$3, 256, 1, 24372);
    			attr_dev(path24, "d", "M45.9,22.4v-8.9c0-0.7,0.2-1.3,0.7-1.8c0.5-0.5,1.1-0.7,1.8-0.7H51c0.7,0,1.3,0.3,1.8,0.8s0.7,1.1,0.7,1.8v8.9H51v-5.1\n\t\t\t h-2.6v5.1C48.4,22.4,45.9,22.4,45.9,22.4z M48.4,16H51v-2.6c0-0.3-0.1-0.6-0.4-0.9c-0.3-0.2-0.6-0.4-0.9-0.4s-0.6,0.1-0.9,0.4\n\t\t\t c-0.3,0.2-0.4,0.5-0.4,0.9L48.4,16L48.4,16z");
    			add_location(path24, file$3, 257, 1, 24458);
    			attr_dev(path25, "d", "M65.8,22.4v-8.9c0-0.7,0.2-1.3,0.7-1.8s1.1-0.7,1.8-0.7h2.6c0.7,0,1.3,0.3,1.8,0.8c0.5,0.5,0.7,1.1,0.7,1.8v8.9h-2.5v-5.1\n\t\t\t h-2.6v5.1H65.8z M68.3,16h2.6v-2.6c0-0.3-0.1-0.6-0.4-0.9s-0.6-0.4-0.9-0.4c-0.3,0-0.6,0.1-0.9,0.4s-0.4,0.5-0.4,0.9L68.3,16\n\t\t\t L68.3,16z");
    			add_location(path25, file$3, 260, 1, 24759);
    			attr_dev(path26, "d", "M76,22.4V12.2h-2.5v-1.3h7.6v1.3h-2.5v10.2H76L76,22.4z");
    			add_location(path26, file$3, 263, 1, 25029);
    			attr_dev(path27, "d", "M83.8,10.9h2.6c0.7,0,1.3,0.3,1.8,0.8c0.5,0.5,0.7,1.1,0.7,1.8v6.4c0,0.7-0.2,1.3-0.7,1.8c-0.5,0.5-1.1,0.8-1.8,0.8h-2.6\n\t\t\t c-0.7,0-1.3-0.2-1.8-0.7c-0.5-0.5-0.7-1.1-0.7-1.8v-6.4c0-0.7,0.2-1.3,0.7-1.8C82.5,11.2,83.1,10.9,83.8,10.9z M83.8,13.5v6.4\n\t\t\t c0,0.3,0.1,0.6,0.4,0.9c0.2,0.3,0.5,0.4,0.9,0.4c0.4,0,0.7-0.1,0.9-0.4c0.2-0.3,0.4-0.5,0.4-0.9v-6.4c0-0.3-0.1-0.6-0.4-0.9\n\t\t\t c-0.3-0.2-0.6-0.4-0.9-0.4c-0.3,0-0.6,0.1-0.9,0.4C83.9,12.8,83.8,13.1,83.8,13.5L83.8,13.5z");
    			add_location(path27, file$3, 264, 1, 25096);
    			attr_dev(path28, "d", "M92.4,10.9H95c0.7,0,1.3,0.3,1.8,0.8c0.5,0.5,0.7,1.1,0.7,1.8v6.4c0,0.7-0.2,1.3-0.7,1.8c-0.5,0.5-1.1,0.8-1.8,0.8h-2.6\n\t\t\t c-0.7,0-1.3-0.2-1.8-0.7c-0.5-0.5-0.7-1.1-0.7-1.8v-6.4c0-0.7,0.2-1.3,0.7-1.8C91.1,11.2,91.7,10.9,92.4,10.9z M92.4,13.5v6.4\n\t\t\t c0,0.3,0.1,0.6,0.4,0.9c0.2,0.3,0.5,0.4,0.9,0.4c0.4,0,0.7-0.1,0.9-0.4c0.2-0.3,0.4-0.5,0.4-0.9v-6.4c0-0.3-0.1-0.6-0.4-0.9\n\t\t\t c-0.3-0.2-0.6-0.4-0.9-0.4c-0.3,0-0.6,0.1-0.9,0.4C92.5,12.8,92.4,13.1,92.4,13.5L92.4,13.5z");
    			add_location(path28, file$3, 268, 1, 25570);
    			attr_dev(polygon, "points", "64.9,10.9 64.9,22.4 62.4,22.4 62.4,15.4 59,18.8 55.6,15.4 55.6,22.4 54.3,22.4 54.3,10.9 54.9,10.9 59.3,15.3\n\t\t\t\t\t 63.7,10.9 \t");
    			add_location(polygon, file$3, 272, 1, 26043);
    			add_location(g20, file$3, 255, 0, 24367);
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "id", "Layer_1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
    			attr_dev(svg, "x", "0px");
    			attr_dev(svg, "y", "0px");
    			attr_dev(svg, "viewBox", "0 0 135.5 111.2");
    			set_style(svg, "enable-background", "new 0 0 135.5 111.2");
    			attr_dev(svg, "xml:space", "preserve");
    			attr_dev(svg, "class", "svelte-14l8fvi");
    			add_location(svg, file$3, 6, 0, 87);
    			attr_dev(div, "class", "iconbox svelte-14l8fvi");
    			add_location(div, file$3, 5, 0, 65);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, g19);
    			append_dev(g19, g0);
    			append_dev(g0, path0);
    			append_dev(g0, path1);
    			append_dev(g19, g3);
    			append_dev(g3, g1);
    			append_dev(g1, path2);
    			append_dev(g3, g2);
    			append_dev(g2, path3);
    			append_dev(g19, g9);
    			append_dev(g9, g4);
    			append_dev(g4, path4);
    			append_dev(g9, g5);
    			append_dev(g5, path5);
    			append_dev(g9, g6);
    			append_dev(g6, path6);
    			append_dev(g6, path7);
    			append_dev(g9, g7);
    			append_dev(g7, path8);
    			append_dev(g9, g8);
    			append_dev(g8, path9);
    			append_dev(g8, path10);
    			append_dev(g19, g18);
    			append_dev(g18, g10);
    			append_dev(g10, path11);
    			append_dev(g18, g11);
    			append_dev(g11, path12);
    			append_dev(g11, path13);
    			append_dev(g18, g12);
    			append_dev(g12, path14);
    			append_dev(g12, path15);
    			append_dev(g18, g13);
    			append_dev(g13, path16);
    			append_dev(g18, g14);
    			append_dev(g14, path17);
    			append_dev(g14, path18);
    			append_dev(g14, path19);
    			append_dev(g18, g15);
    			append_dev(g15, path20);
    			append_dev(g18, g16);
    			append_dev(g16, path21);
    			append_dev(g18, g17);
    			append_dev(g17, path22);
    			append_dev(svg, g20);
    			append_dev(g20, path23);
    			append_dev(g20, path24);
    			append_dev(g20, path25);
    			append_dev(g20, path26);
    			append_dev(g20, path27);
    			append_dev(g20, path28);
    			append_dev(g20, polygon);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Tama', slots, []);
    	let { fill = "none" } = $$props;
    	let { d = "" } = $$props;
    	const writable_props = ['fill', 'd'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Tama> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('fill' in $$props) $$invalidate(0, fill = $$props.fill);
    		if ('d' in $$props) $$invalidate(1, d = $$props.d);
    	};

    	$$self.$capture_state = () => ({ fill, d });

    	$$self.$inject_state = $$props => {
    		if ('fill' in $$props) $$invalidate(0, fill = $$props.fill);
    		if ('d' in $$props) $$invalidate(1, d = $$props.d);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [fill, d];
    }

    class Tama extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { fill: 0, d: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Tama",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get fill() {
    		throw new Error("<Tama>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fill(value) {
    		throw new Error("<Tama>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get d() {
    		throw new Error("<Tama>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set d(value) {
    		throw new Error("<Tama>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Controller.svelte generated by Svelte v3.59.2 */

    const { console: console_1$2 } = globals;
    const file$2 = "src/Controller.svelte";

    function create_fragment$3(ctx) {
    	let svg;
    	let g0;
    	let foreignObject;
    	let html_button;
    	let circle0;
    	let line0;
    	let circle1;
    	let line1;
    	let circle2;
    	let line2;
    	let circle3;
    	let line3;
    	let circle4;
    	let line4;
    	let circle5;
    	let line5;
    	let g1;
    	let circle6;
    	let polyline;
    	let t1;
    	let div0;
    	let button0;
    	let t2;
    	let button1;
    	let t3;
    	let button2;
    	let t4;
    	let button3;
    	let t5;
    	let button4;
    	let t6;
    	let button5;
    	let t7;
    	let div1;
    	let button6;
    	let t8;
    	let button7;
    	let t10;
    	let button8;
    	let t12;
    	let button9;
    	let t14;
    	let button10;
    	let t16;
    	let button11;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			g0 = svg_element("g");
    			foreignObject = svg_element("foreignObject");
    			html_button = element("html:button");
    			html_button.textContent = "Button1";
    			circle0 = svg_element("circle");
    			line0 = svg_element("line");
    			circle1 = svg_element("circle");
    			line1 = svg_element("line");
    			circle2 = svg_element("circle");
    			line2 = svg_element("line");
    			circle3 = svg_element("circle");
    			line3 = svg_element("line");
    			circle4 = svg_element("circle");
    			line4 = svg_element("line");
    			circle5 = svg_element("circle");
    			line5 = svg_element("line");
    			g1 = svg_element("g");
    			circle6 = svg_element("circle");
    			polyline = svg_element("polyline");
    			t1 = space();
    			div0 = element("div");
    			button0 = element("button");
    			t2 = space();
    			button1 = element("button");
    			t3 = space();
    			button2 = element("button");
    			t4 = space();
    			button3 = element("button");
    			t5 = space();
    			button4 = element("button");
    			t6 = space();
    			button5 = element("button");
    			t7 = space();
    			div1 = element("div");
    			button6 = element("button");
    			t8 = space();
    			button7 = element("button");
    			button7.textContent = "↻";
    			t10 = space();
    			button8 = element("button");
    			button8.textContent = "↻";
    			t12 = space();
    			button9 = element("button");
    			button9.textContent = "↻";
    			t14 = space();
    			button10 = element("button");
    			button10.textContent = "↻";
    			t16 = space();
    			button11 = element("button");
    			button11.textContent = "↻";
    			add_location(html_button, file$2, 16, 12, 465);
    			attr_dev(foreignObject, "position", "");
    			attr_dev(foreignObject, "attributes", "");
    			add_location(foreignObject, file$2, 15, 8, 417);
    			attr_dev(circle0, "class", "st0 svelte-1yrb3va");
    			attr_dev(circle0, "cx", "100");
    			attr_dev(circle0, "cy", "46.87");
    			attr_dev(circle0, "r", "8.63");
    			add_location(circle0, file$2, 18, 5, 530);
    			attr_dev(line0, "class", "st0 svelte-1yrb3va");
    			attr_dev(line0, "x1", "100");
    			attr_dev(line0, "y1", "55.49");
    			attr_dev(line0, "x2", "100");
    			attr_dev(line0, "y2", "100");
    			add_location(line0, file$2, 19, 5, 586);
    			attr_dev(circle1, "class", "st0 svelte-1yrb3va");
    			attr_dev(circle1, "cx", "53.85");
    			attr_dev(circle1, "cy", "73.29");
    			attr_dev(circle1, "r", "8.63");
    			add_location(circle1, file$2, 20, 5, 649);
    			attr_dev(line1, "class", "st0 svelte-1yrb3va");
    			attr_dev(line1, "x1", "61.32");
    			attr_dev(line1, "y1", "77.6");
    			attr_dev(line1, "x2", "100");
    			attr_dev(line1, "y2", "100");
    			add_location(line1, file$2, 21, 5, 707);
    			attr_dev(circle2, "class", "st0 svelte-1yrb3va");
    			attr_dev(circle2, "cx", "53.85");
    			attr_dev(circle2, "cy", "126.12");
    			attr_dev(circle2, "r", "8.63");
    			add_location(circle2, file$2, 22, 5, 771);
    			attr_dev(line2, "class", "st0 svelte-1yrb3va");
    			attr_dev(line2, "x1", "61.32");
    			attr_dev(line2, "y1", "121.81");
    			attr_dev(line2, "x2", "100");
    			attr_dev(line2, "y2", "100");
    			add_location(line2, file$2, 23, 5, 830);
    			attr_dev(circle3, "class", "st0 svelte-1yrb3va");
    			attr_dev(circle3, "cx", "100");
    			attr_dev(circle3, "cy", "152.54");
    			attr_dev(circle3, "r", "8.63");
    			add_location(circle3, file$2, 24, 5, 896);
    			attr_dev(line3, "class", "st0 svelte-1yrb3va");
    			attr_dev(line3, "x1", "100");
    			attr_dev(line3, "y1", "143.91");
    			attr_dev(line3, "x2", "100");
    			attr_dev(line3, "y2", "100");
    			add_location(line3, file$2, 25, 5, 953);
    			attr_dev(circle4, "class", "st0 svelte-1yrb3va");
    			attr_dev(circle4, "cx", "145.36");
    			attr_dev(circle4, "cy", "126.12");
    			attr_dev(circle4, "r", "8.63");
    			add_location(circle4, file$2, 26, 5, 1017);
    			attr_dev(line4, "class", "st0 svelte-1yrb3va");
    			attr_dev(line4, "x1", "137.89");
    			attr_dev(line4, "y1", "121.81");
    			attr_dev(line4, "x2", "100");
    			attr_dev(line4, "y2", "100");
    			add_location(line4, file$2, 27, 5, 1077);
    			attr_dev(circle5, "class", "st0 svelte-1yrb3va");
    			attr_dev(circle5, "cx", "145.36");
    			attr_dev(circle5, "cy", "73.29");
    			attr_dev(circle5, "r", "8.63");
    			add_location(circle5, file$2, 28, 5, 1144);
    			attr_dev(line5, "class", "st0 svelte-1yrb3va");
    			attr_dev(line5, "x1", "137.89");
    			attr_dev(line5, "y1", "77.6");
    			attr_dev(line5, "x2", "100");
    			attr_dev(line5, "y2", "100");
    			add_location(line5, file$2, 29, 5, 1203);
    			add_location(g0, file$2, 14, 4, 405);
    			attr_dev(circle6, "cx", "100");
    			attr_dev(circle6, "cy", "100");
    			attr_dev(circle6, "r", "13.12");
    			add_location(circle6, file$2, 32, 8, 1311);
    			attr_dev(polyline, "class", "st1 svelte-1yrb3va");
    			attr_dev(polyline, "points", "97,95 100,90 103,95 ");
    			add_location(polyline, file$2, 33, 8, 1357);
    			attr_dev(g1, "class", "rotation-point svelte-1yrb3va");
    			add_location(g1, file$2, 31, 4, 1276);
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "id", "Layer_1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "xmlns:xlink", "http://www.w3.org/1999/xlink");
    			attr_dev(svg, "x", "0px");
    			attr_dev(svg, "y", "0px");
    			attr_dev(svg, "viewBox", "0 0 200 200");
    			set_style(svg, "enable-background", "new 0 0 200 200");
    			attr_dev(svg, "xml:space", "preserve");
    			add_location(svg, file$2, 11, 0, 185);
    			attr_dev(button0, "class", "button button1 svelte-1yrb3va");
    			add_location(button0, file$2, 38, 4, 1460);
    			attr_dev(button1, "class", "button button2 svelte-1yrb3va");
    			add_location(button1, file$2, 41, 4, 1539);
    			attr_dev(button2, "class", "button button3 svelte-1yrb3va");
    			add_location(button2, file$2, 44, 4, 1618);
    			attr_dev(button3, "class", "button button4 svelte-1yrb3va");
    			add_location(button3, file$2, 47, 4, 1697);
    			attr_dev(button4, "class", "button button5 svelte-1yrb3va");
    			add_location(button4, file$2, 50, 4, 1776);
    			attr_dev(button5, "class", "button button6 svelte-1yrb3va");
    			add_location(button5, file$2, 53, 4, 1855);
    			attr_dev(div0, "class", "buttonoverlay svelte-1yrb3va");
    			add_location(div0, file$2, 37, 0, 1428);
    			attr_dev(button6, "class", "button button1r svelte-1yrb3va");
    			add_location(button6, file$2, 59, 4, 1970);
    			attr_dev(button7, "class", "button button2r svelte-1yrb3va");
    			add_location(button7, file$2, 62, 4, 2050);
    			attr_dev(button8, "class", "button button3r svelte-1yrb3va");
    			add_location(button8, file$2, 65, 4, 2139);
    			attr_dev(button9, "class", "button button4r svelte-1yrb3va");
    			add_location(button9, file$2, 68, 4, 2228);
    			attr_dev(button10, "class", "button button5r svelte-1yrb3va");
    			add_location(button10, file$2, 71, 4, 2317);
    			attr_dev(button11, "class", "button button6r svelte-1yrb3va");
    			add_location(button11, file$2, 74, 4, 2406);
    			attr_dev(div1, "class", "buttonoverlay svelte-1yrb3va");
    			add_location(div1, file$2, 58, 0, 1938);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);
    			append_dev(svg, g0);
    			append_dev(g0, foreignObject);
    			append_dev(foreignObject, html_button);
    			append_dev(g0, circle0);
    			append_dev(g0, line0);
    			append_dev(g0, circle1);
    			append_dev(g0, line1);
    			append_dev(g0, circle2);
    			append_dev(g0, line2);
    			append_dev(g0, circle3);
    			append_dev(g0, line3);
    			append_dev(g0, circle4);
    			append_dev(g0, line4);
    			append_dev(g0, circle5);
    			append_dev(g0, line5);
    			append_dev(svg, g1);
    			append_dev(g1, circle6);
    			append_dev(g1, polyline);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div0, anchor);
    			append_dev(div0, button0);
    			append_dev(div0, t2);
    			append_dev(div0, button1);
    			append_dev(div0, t3);
    			append_dev(div0, button2);
    			append_dev(div0, t4);
    			append_dev(div0, button3);
    			append_dev(div0, t5);
    			append_dev(div0, button4);
    			append_dev(div0, t6);
    			append_dev(div0, button5);
    			insert_dev(target, t7, anchor);
    			insert_dev(target, div1, anchor);
    			append_dev(div1, button6);
    			append_dev(div1, t8);
    			append_dev(div1, button7);
    			append_dev(div1, t10);
    			append_dev(div1, button8);
    			append_dev(div1, t12);
    			append_dev(div1, button9);
    			append_dev(div1, t14);
    			append_dev(div1, button10);
    			append_dev(div1, t16);
    			append_dev(div1, button11);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*click_handler*/ ctx[2], false, false, false, false),
    					listen_dev(button1, "click", /*click_handler_1*/ ctx[3], false, false, false, false),
    					listen_dev(button2, "click", /*click_handler_2*/ ctx[4], false, false, false, false),
    					listen_dev(button3, "click", /*click_handler_3*/ ctx[5], false, false, false, false),
    					listen_dev(button4, "click", /*click_handler_4*/ ctx[6], false, false, false, false),
    					listen_dev(button5, "click", /*click_handler_5*/ ctx[7], false, false, false, false),
    					listen_dev(button6, "click", /*click_handler_6*/ ctx[8], false, false, false, false),
    					listen_dev(button7, "click", /*click_handler_7*/ ctx[9], false, false, false, false),
    					listen_dev(button8, "click", /*click_handler_8*/ ctx[10], false, false, false, false),
    					listen_dev(button9, "click", /*click_handler_9*/ ctx[11], false, false, false, false),
    					listen_dev(button10, "click", /*click_handler_10*/ ctx[12], false, false, false, false),
    					listen_dev(button11, "click", /*click_handler_11*/ ctx[13], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div0);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(div1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Controller', slots, []);
    	let { movement } = $$props;

    	function test(val) {
    		$$invalidate(1, movement = val);
    		console.log(val);
    	} //      document.querySelector(".rotation-point").classList.add(val);

    	$$self.$$.on_mount.push(function () {
    		if (movement === undefined && !('movement' in $$props || $$self.$$.bound[$$self.$$.props['movement']])) {
    			console_1$2.warn("<Controller> was created without expected prop 'movement'");
    		}
    	});

    	const writable_props = ['movement'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$2.warn(`<Controller> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => test("mr");
    	const click_handler_1 = () => test("mw");
    	const click_handler_2 = () => test("my");
    	const click_handler_3 = () => test("mz");
    	const click_handler_4 = () => test("mb");
    	const click_handler_5 = () => test("mc");
    	const click_handler_6 = () => test("rM");
    	const click_handler_7 = () => test("rL");
    	const click_handler_8 = () => test("rR");
    	const click_handler_9 = () => test("rL");
    	const click_handler_10 = () => test("rR");
    	const click_handler_11 = () => test("rR");

    	$$self.$$set = $$props => {
    		if ('movement' in $$props) $$invalidate(1, movement = $$props.movement);
    	};

    	$$self.$capture_state = () => ({ movement, test });

    	$$self.$inject_state = $$props => {
    		if ('movement' in $$props) $$invalidate(1, movement = $$props.movement);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		test,
    		movement,
    		click_handler,
    		click_handler_1,
    		click_handler_2,
    		click_handler_3,
    		click_handler_4,
    		click_handler_5,
    		click_handler_6,
    		click_handler_7,
    		click_handler_8,
    		click_handler_9,
    		click_handler_10,
    		click_handler_11
    	];
    }

    class Controller extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { movement: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Controller",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get movement() {
    		throw new Error("<Controller>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set movement(value) {
    		throw new Error("<Controller>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    var layout = {
      buttons: [
        "A",
        "B",
        "X",
        "Y",
        "LB",
        "RB",
        "LT",
        "RT",
        "Back",
        "Start",
        "LS",
        "RS",
        "DPadUp",
        "DPadDown",
        "DPadLeft",
        "DPadRight"
      ],
      axis: ["LeftStickX", "LeftStickY", "RightStickX", "RightStickY"]
    };

    /**
     * Linear mapping https://stackoverflow.com/a/12931306
     *
     * @param {*} low1
     * @param {*} high1
     * @param {*} low2
     * @param {*} rangeB2
     */
    function mapRange(value, low1, high1, low2, high2) {
      return low2 + ((high2 - low2) * (value - low1)) / (high1 - low1);
    }

    // This file sends the updated state to Gamepad.svelte.
    // Does a rAF loop when gamepad connected.


    let frame = null;
    let gamepads = {
      0: { layout: null },
      1: { layout: null },
      2: { layout: null },
      3: { layout: null }
    };

    let watcherRunning = false;

    /**
     * Update the Gamepad states by calling onChange
     */
    function loop() {
      const pads = navigator.getGamepads();

      for (let i = 0; i <= pads.length; i++) {
        const pad = pads[i];
        const gamepad = gamepads[i];
        if (pad && gamepad && gamepad.onChange) {
          const newState = mapLayout(pad, gamepad.layout, gamepad.stickThreshold);
          gamepad.onChange(newState);
        }
      }

      // may need => if (window && window.requestAnimationFrame) AND webkit prefixes
      frame = requestAnimationFrame(loop);
    }

    function mapLayout(gamepad, layout, stickThreshold) {
      const mappedValues = {};
      mappedValues.buttons = mapButtons(gamepad, layout);
      mappedValues.axes = mapAxes(gamepad, layout, stickThreshold);
      return mappedValues;
    }

    function mapButtons(gamepad, layout) {
      const buttons = {};
      for (let i = 0; i < layout.buttons.length; i++) {
        const mappedName = layout.buttons[i];
        buttons[mappedName] = gamepad.buttons[i];
      }
      return buttons;
    }

    function mapAxes(gamepad, layout, stickThreshold) {
      const leftStick = { x: 0, y: 0 };
      const rightStick = { x: 0, y: 0 };

      for (let i = 0; i < layout.axis.length; i++) {
        const mappedName = layout.axis[i];

        const val = gamepad.axes[i];

        if (mappedName === "LeftStickX") {
          leftStick.x = fixThreshold(val, stickThreshold);
        } else if (mappedName === "LeftStickY") {
          leftStick.y = fixThreshold(val, stickThreshold);
        } else if (mappedName === "RightStickX") {
          rightStick.x = fixThreshold(val, stickThreshold);
        } else if (mappedName === "RightStickY") {
          rightStick.y = fixThreshold(val, stickThreshold);
        }
      }

      return { LeftStick: leftStick, RightStick: rightStick };
    }

    /**
     * threshold === 0.2
     * 0.1 => 0
     * 0.2 => 0
     * 0.6 => 0.5
     * 1 => 1
     *
     * -0.1 => 0
     * -0.2 => 0
     * -0.6 => -0.5
     * -1 => -1
     * @param {*} value
     * @param {*} threshold
     */
    function fixThreshold(value, threshold) {
      // below or equal threshold
      if (value < 0 && value >= -threshold) return 0;
      if (value >= 0 && value <= threshold) return 0;

      // above threshold
      if (value >= 0 && value > threshold)
        return mapRange(value, threshold, 1, 0, 1);

      if (value < 0 && value < -threshold)
        return mapRange(value, -1, -threshold, -1, 0);

      // add tests dummy.
      // console.log(mapRange(0.2, 0.2, 1, 0, 1));
      // console.log(mapRange(1, 0.2, 1, 0, 1));
      // console.log(mapRange(1, 0.2, 1, 0, 1));
      // console.log(50, mapRange(0.6, 0.2, 1, 0, 1));
      // console.log(25, mapRange(0.4, 0.2, 1, 0, 1));
      // console.log(75, mapRange(0.8, 0.2, 1, 0, 1));
    }

    /**
     * Checks for gamepads. When it finds one, start looping.
     * Until then, verify every x milliseconds.
     */
    function startGamepadWatcher() {
      watcherRunning = true;

      const pads = navigator.getGamepads();

      // Start loop if one of the 4 pads available.
      if (pads[0] || pads[1] || pads[2] || pads[3]) {
        loop();
      } else {
        setTimeout(startGamepadWatcher, 500);
      }
    }

    function addGamepad(gamepadIndex, args) {
      console.log("add");
      gamepads[gamepadIndex] = args;

      if (!watcherRunning) startGamepadWatcher();
      return () => cancelAnimationFrame(frame);
    }

    /* src/Gamepad.svelte generated by Svelte v3.59.2 */

    const { Object: Object_1 } = globals;

    function create_fragment$2(ctx) {
    	const block = {
    		c: noop,
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: noop,
    		p: noop,
    		i: noop,
    		o: noop,
    		d: noop
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Gamepad', slots, []);
    	let { gamepadIndex } = $$props;
    	let { stickThreshold = 0.2 } = $$props;
    	const dispatch = createEventDispatcher();
    	let gamepadState = null;

    	function onChange(newGamepadState) {
    		if (!gamepadState) {
    			dispatch("Connected", { gamepadIndex });
    		}

    		// handle buttons
    		Object.keys(newGamepadState.buttons).forEach(key => {
    			const button = newGamepadState.buttons[key];

    			if (button && button.pressed) {
    				dispatch(key, button); // e.g. "RT" , {pressed: true, value: 0.2}
    			}

    			// Send null when player stops pressing button
    			// Needs to check if the previous state is marked as pressed
    			if (button && !button.pressed && gamepadState && gamepadState.buttons[key].pressed) {
    				dispatch(key, null);
    			}
    		});

    		// handle axes
    		Object.keys(newGamepadState.axes).forEach(key => {
    			const axis = newGamepadState.axes[key];

    			if (axis) {
    				dispatch(key, axis); // e.g. "LeftStick" , {x: 10, y:0}
    			}
    		});

    		gamepadState = { ...newGamepadState };
    	}

    	const args = { layout, onChange, stickThreshold };

    	onMount(() => {
    		const cleanup = addGamepad(gamepadIndex, args);
    		return cleanup;
    	});

    	$$self.$$.on_mount.push(function () {
    		if (gamepadIndex === undefined && !('gamepadIndex' in $$props || $$self.$$.bound[$$self.$$.props['gamepadIndex']])) {
    			console.warn("<Gamepad> was created without expected prop 'gamepadIndex'");
    		}
    	});

    	const writable_props = ['gamepadIndex', 'stickThreshold'];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Gamepad> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('gamepadIndex' in $$props) $$invalidate(0, gamepadIndex = $$props.gamepadIndex);
    		if ('stickThreshold' in $$props) $$invalidate(1, stickThreshold = $$props.stickThreshold);
    	};

    	$$self.$capture_state = () => ({
    		layout,
    		onMount,
    		createEventDispatcher,
    		addGamepad,
    		gamepadIndex,
    		stickThreshold,
    		dispatch,
    		gamepadState,
    		onChange,
    		args
    	});

    	$$self.$inject_state = $$props => {
    		if ('gamepadIndex' in $$props) $$invalidate(0, gamepadIndex = $$props.gamepadIndex);
    		if ('stickThreshold' in $$props) $$invalidate(1, stickThreshold = $$props.stickThreshold);
    		if ('gamepadState' in $$props) gamepadState = $$props.gamepadState;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [gamepadIndex, stickThreshold];
    }

    class Gamepad extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { gamepadIndex: 0, stickThreshold: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Gamepad",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get gamepadIndex() {
    		throw new Error("<Gamepad>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set gamepadIndex(value) {
    		throw new Error("<Gamepad>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stickThreshold() {
    		throw new Error("<Gamepad>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stickThreshold(value) {
    		throw new Error("<Gamepad>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src/Signaling.svelte generated by Svelte v3.59.2 */

    const { console: console_1$1 } = globals;
    const file$1 = "src/Signaling.svelte";

    function create_fragment$1(ctx) {
    	let div;
    	let button0;
    	let t1;
    	let button1;
    	let t3;
    	let button2;

    	const block = {
    		c: function create() {
    			div = element("div");
    			button0 = element("button");
    			button0.textContent = "Start Streaming";
    			t1 = space();
    			button1 = element("button");
    			button1.textContent = "Stop Streaming";
    			t3 = space();
    			button2 = element("button");
    			button2.textContent = "Start Sending Audio";
    			attr_dev(button0, "id", "start");
    			attr_dev(button0, "title", "If you do not see any video stream, make sure your browser supports the codec used within this demo (see the source code for details, or try Firefox or Chrome)");
    			add_location(button0, file$1, 332, 4, 13292);
    			attr_dev(button1, "id", "stop");
    			add_location(button1, file$1, 333, 4, 13508);
    			attr_dev(button2, "id", "audStart");
    			add_location(button2, file$1, 334, 4, 13556);
    			add_location(div, file$1, 331, 0, 13282);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, button0);
    			append_dev(div, t1);
    			append_dev(div, button1);
    			append_dev(div, t3);
    			append_dev(div, button2);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function signal(url, onStream, onError, onClose, onMessage) {
    	if ("WebSocket" in window) {
    		console.log("opening web socket: " + url);
    		var ws = new WebSocket(url);
    		var pc;
    		var iceCandidates = [];
    		var hasRemoteDesc = false;

    		function addIceCandidates() {
    			if (hasRemoteDesc) {
    				iceCandidates.forEach(function (candidate) {
    					pc.addIceCandidate(
    						candidate,
    						function () {
    							console.log("IceCandidate added: " + JSON.stringify(candidate));
    						},
    						function (error) {
    							console.error("addIceCandidate error: " + error);
    						}
    					);
    				});

    				iceCandidates = [];
    			}
    		}

    		ws.onopen = function () {
    			/* First we create a peer connection */
    			var config = {
    				"iceServers": [{ "urls": ["stun:stun.l.google.com:19302"] }]
    			};

    			var options = { optional: [] };
    			pc = new RTCPeerConnection(config, options);
    			iceCandidates = [];
    			hasRemoteDesc = false;

    			pc.onicecandidate = function (event) {
    				if (event.candidate) {
    					var candidate = {
    						sdpMLineIndex: event.candidate.sdpMLineIndex,
    						sdpMid: event.candidate.sdpMid,
    						candidate: event.candidate.candidate
    					};

    					var request = {
    						what: "addIceCandidate",
    						data: JSON.stringify(candidate)
    					};

    					ws.send(JSON.stringify(request));
    				} else {
    					console.log("end of candidates.");
    				}
    			};

    			if ('ontrack' in pc) {
    				pc.ontrack = function (event) {
    					onStream(event.streams[0]);
    				};
    			} else {
    				// onaddstream() deprecated
    				pc.onaddstream = function (event) {
    					onStream(event.stream);
    				};
    			}

    			pc.onremovestream = function (event) {
    				console.log("the stream has been removed: do your stuff now");
    			};

    			pc.ondatachannel = function (event) {
    				console.log("a data channel is available: do your stuff with it");
    			}; // For an example, see https://www.linux-projects.org/uv4l/tutorials/webrtc-data-channels/

    			/* kindly signal the remote peer that we would like to initiate a call */
    			var request = {
    				what: "call",
    				options: {
    					// If forced, the hardware codec depends on the arch.
    					// (e.g. it's H264 on the Raspberry Pi)
    					// Make sure the browser supports the codec too.
    					// force_hw_vcodec: true,
    					//                      vformat: 70, /* 30=640x480, 30 fps */
    					trickle_ice: true
    				}
    			};

    			console.log("send message " + JSON.stringify(request));
    			ws.send(JSON.stringify(request));
    		};

    		ws.onmessage = function (evt) {
    			var msg = JSON.parse(evt.data);
    			var what = msg.what;
    			var data = msg.data;
    			console.log("received message " + JSON.stringify(msg));

    			switch (what) {
    				case "offer":
    					var mediaConstraints = {
    						optional: [],
    						mandatory: {
    							OfferToReceiveAudio: true,
    							OfferToReceiveVideo: true
    						}
    					};
    					pc.setRemoteDescription(
    						new RTCSessionDescription(JSON.parse(data)),
    						function onRemoteSdpSuccess() {
    							hasRemoteDesc = true;
    							addIceCandidates();

    							pc.createAnswer(
    								function (sessionDescription) {
    									pc.setLocalDescription(sessionDescription);

    									var request = {
    										what: "answer",
    										data: JSON.stringify(sessionDescription)
    									};

    									ws.send(JSON.stringify(request));
    								},
    								function (error) {
    									onError("failed to create answer: " + error);
    								},
    								mediaConstraints
    							);
    						},
    						function onRemoteSdpError(event) {
    							onError('failed to set the remote description: ' + event);
    							ws.close();
    						}
    					);
    					break;
    				case "answer":
    					break;
    				case "message":
    					if (onMessage) {
    						onMessage(msg.data);
    					}
    					break;
    				case "iceCandidate":
    					// received when trickle ice is used (see the "call" request)
    					if (!msg.data) {
    						console.log("Ice Gathering Complete");
    						break;
    					}
    					var elt = JSON.parse(msg.data);
    					let candidate = new RTCIceCandidate({
    							sdpMLineIndex: elt.sdpMLineIndex,
    							candidate: elt.candidate
    						});
    					iceCandidates.push(candidate);
    					addIceCandidates();
    					break;
    				case "iceCandidates":
    					// received when trickle ice is NOT used (see the "call" request)
    					var candidates = JSON.parse(msg.data);
    					for (var i = 0; candidates && i < candidates.length; i++) {
    						var elt = candidates[i]; // it internally checks if the remote description has been set

    						let candidate = new RTCIceCandidate({
    								sdpMLineIndex: elt.sdpMLineIndex,
    								candidate: elt.candidate
    							});

    						iceCandidates.push(candidate);
    					}
    					addIceCandidates();
    					break;
    			}
    		};

    		ws.onclose = function (event) {
    			console.log('socket closed with code: ' + event.code);

    			if (pc) {
    				pc.close();
    				pc = null;
    				ws = null;
    			}

    			if (onClose) {
    				onClose();
    			}
    		};

    		ws.onerror = function (event) {
    			onError("An error has occurred on the websocket (make sure the address is correct)!");
    		};

    		this.hangup = function () {
    			if (ws) {
    				var request = { what: "hangup" };
    				console.log("send message " + JSON.stringify(request));
    				ws.send(JSON.stringify(request));
    			}
    		};
    	} else {
    		onError("Sorry, this browser does not support Web Sockets. Bye.");
    	}
    }

    function handleError(error) {
    	const errorMessage = 'navigator.MediaDevices.getUserMedia error: ' + error.message + ' ' + error.name;
    	document.getElementById('errorMsg').innerText = errorMessage;
    	console.log(errorMessage);
    	return null;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Signaling', slots, []);

    	RTCPeerConnection = window.RTCPeerConnection || /*window.mozRTCPeerConnection ||*/
    	window.webkitRTCPeerConnection;

    	RTCSessionDescription = /*window.mozRTCSessionDescription ||*/
    	window.RTCSessionDescription;

    	RTCIceCandidate = /*window.mozRTCIceCandidate ||*/
    	window.RTCIceCandidate;

    	var video = document.getElementById('v');
    	var signalObj = null;
    	var signalling_server_hostname = location.hostname || "192.168.1.8";
    	var signalling_server_address = signalling_server_hostname + ':' + (9000 );
    	var isStreaming = false;
    	const audio = document.querySelector('audio');
    	const constraints = window.constraints = { audio: true, video: false };

    	function handleSuccess(stream) {
    		const audioTracks = stream.getAudioTracks();
    		console.log('Got stream with constraints:', constraints);
    		console.log('Using audio device: ' + audioTracks[0].label);
    		signalObj.addAudio(stream);

    		stream.oninactive = function () {
    			console.log('Stream ended');
    		};

    		window.stream = stream; // make variable available to browser console
    	} //      audio.srcObject = stream;
    	//      return stream

    	window.addEventListener('DOMContentLoaded', function () {
    		var start = document.getElementById('start');
    		var stop = document.getElementById('stop');
    		document.getElementById('v');
    		var audStart = document.getElementById('audStart');
    		var tamaview = document.getElementById('tamaview');
    		document.getElementById('tamablur');

    		start.addEventListener(
    			'click',
    			function (e) {
    				var address = signalling_server_address;
    				var protocol = location.protocol === "https:" ? "wss:" : "ws:";
    				var wsurl = protocol + '//' + address + '/stream/webrtc';

    				if (!isStreaming) {
    					signalObj = new signal(wsurl,
    					function (stream) {
    							console.log('got a stream!');

    							//var url = window.URL || window.webkitURL;
    							//video.src = url ? url.createObjectURL(stream) : stream; // deprecated
    							tamaview.srcObject = stream;

    							//                                         tamablur.srcObject = stream;
    							tamaview.play();
    						},
    					//video.srcObject = stream;
    						//video.play();
    						function (error) {
    							alert(error); //                                         tamablur.play();
    							//                                         tamablur.volume = 0;
    						},
    					function () {
    							console.log('websocket closed. bye bye!');

    							//video.srcObject = null;
    							tamaview.srcObject = null;

    							//                                         itamablur.srcObject = null;
    							//video.src = ''; // deprecated
    							//ctx.clearRect(0, 0, canvas.width, canvas.height);
    							isStreaming = false;
    						},
    					function (message) {
    							alert(message);
    						});
    				}
    			},
    			false
    		);

    		stop.addEventListener(
    			'click',
    			function (e) {
    				if (signalObj) {
    					signalObj.hangup();
    					signalObj = null;
    				}
    			},
    			false
    		);

    		audStart.addEventListener('click', function (e) {
    			navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess).catch(handleError);
    		}); //          signalObj.addAudio(audiostream)

    		// Wait until the video stream can play
    		tamaview.addEventListener(
    			'canplay',
    			function (e) {
    				if (!isStreaming) {
    					//canvas.setAttribute('width', video.videoWidth);
    					//canvas.setAttribute('height', video.videoHeight);
    					isStreaming = true;
    				}
    			},
    			false
    		);

    		// Wait for the video to start to play
    		tamaview.addEventListener(
    			'play',
    			function () {
    				// Every 33 milliseconds copy the video image to the canvas
    				setInterval(
    					function () {
    						if (tamaview.paused || tamaview.ended) {
    							return; //var w = canvas.getAttribute('width');
    							//var h = canvas.getAttribute('height');
    						}
    					},
    					//ctx.fillRect(0, 0, w, h);
    					//ctx.drawImage(video, 0, 0, w, h);
    					33
    				); //var w = canvas.getAttribute('width');
    				//var h = canvas.getAttribute('height');
    			},
    			false
    		);
    	});

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$1.warn(`<Signaling> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({
    		video,
    		signalObj,
    		signalling_server_hostname,
    		signalling_server_address,
    		isStreaming,
    		signal,
    		audio,
    		constraints,
    		handleSuccess,
    		handleError
    	});

    	$$self.$inject_state = $$props => {
    		if ('video' in $$props) video = $$props.video;
    		if ('signalObj' in $$props) signalObj = $$props.signalObj;
    		if ('signalling_server_hostname' in $$props) signalling_server_hostname = $$props.signalling_server_hostname;
    		if ('signalling_server_address' in $$props) signalling_server_address = $$props.signalling_server_address;
    		if ('isStreaming' in $$props) isStreaming = $$props.isStreaming;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [];
    }

    class Signaling extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Signaling",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src/App.svelte generated by Svelte v3.59.2 */

    const { console: console_1, window: window_1 } = globals;

    const file = "src/App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[37] = list[i];
    	return child_ctx;
    }

    // (695:16) {#each collist as col}
    function create_each_block(ctx) {
    	let button;
    	let t_value = /*col*/ ctx[37].name + "";
    	let t;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[14](/*col*/ ctx[37]);
    	}

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text(t_value);
    			add_location(button, file, 695, 20, 16742);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);
    			append_dev(button, t);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", click_handler, false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(695:16) {#each collist as col}",
    		ctx
    	});

    	return block;
    }

    function create_fragment(ctx) {
    	let div7;
    	let div2;
    	let div0;
    	let t0;
    	let form;
    	let input0;
    	let t1;
    	let input1;
    	let t2;
    	let input2;
    	let t3;
    	let input3;
    	let t4;
    	let div1;
    	let t5;
    	let div3;
    	let tama;
    	let t6;
    	let div6;
    	let div4;
    	let controller;
    	let updating_movement;
    	let t7;
    	let div5;
    	let signaling;
    	let t8;
    	let gamepad;
    	let t9;
    	let div9;
    	let video;
    	let t10;
    	let div8;
    	let t11;
    	let img;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*collist*/ ctx[10];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	tama = new Tama({ $$inline: true });

    	function controller_movement_binding(value) {
    		/*controller_movement_binding*/ ctx[15](value);
    	}

    	let controller_props = {};

    	if (/*movement*/ ctx[0] !== void 0) {
    		controller_props.movement = /*movement*/ ctx[0];
    	}

    	controller = new Controller({ props: controller_props, $$inline: true });
    	binding_callbacks.push(() => bind(controller, 'movement', controller_movement_binding));
    	signaling = new Signaling({ $$inline: true });

    	gamepad = new Gamepad({
    			props: { gamepadIndex: 0 },
    			$$inline: true
    		});

    	gamepad.$on("Connected", gamepadConnected);
    	gamepad.$on("LeftStick", /*LeftStick*/ ctx[3]);
    	gamepad.$on("RightStick", /*RightStick*/ ctx[4]);
    	gamepad.$on("LT", /*LBPressed*/ ctx[7]);
    	gamepad.$on("RT", /*RBPressed*/ ctx[6]);
    	gamepad.$on("RS", /*RSPressed*/ ctx[5]);

    	const block = {
    		c: function create() {
    			div7 = element("div");
    			div2 = element("div");
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t0 = space();
    			form = element("form");
    			input0 = element("input");
    			t1 = space();
    			input1 = element("input");
    			t2 = space();
    			input2 = element("input");
    			t3 = space();
    			input3 = element("input");
    			t4 = space();
    			div1 = element("div");
    			t5 = space();
    			div3 = element("div");
    			create_component(tama.$$.fragment);
    			t6 = space();
    			div6 = element("div");
    			div4 = element("div");
    			create_component(controller.$$.fragment);
    			t7 = space();
    			div5 = element("div");
    			create_component(signaling.$$.fragment);
    			t8 = space();
    			create_component(gamepad.$$.fragment);
    			t9 = space();
    			div9 = element("div");
    			video = element("video");
    			t10 = space();
    			div8 = element("div");
    			t11 = space();
    			img = element("img");
    			attr_dev(div0, "class", "column svelte-1rwmkqc");
    			attr_dev(div0, "id", "colorbuttons");
    			add_location(div0, file, 693, 12, 16644);
    			attr_dev(input0, "name", "s");
    			attr_dev(input0, "placeholder", "speed");
    			add_location(input0, file, 699, 13, 16918);
    			attr_dev(input1, "name", "d");
    			attr_dev(input1, "placeholder", "direction");
    			add_location(input1, file, 700, 16, 16973);
    			attr_dev(input2, "name", "r");
    			attr_dev(input2, "placeholder", "rotation");
    			add_location(input2, file, 701, 16, 17032);
    			attr_dev(input3, "type", "submit");
    			input3.value = "create";
    			add_location(input3, file, 702, 13, 17087);
    			attr_dev(form, "class", "svelte-1rwmkqc");
    			add_location(form, file, 698, 12, 16858);
    			attr_dev(div1, "class", "column svelte-1rwmkqc");
    			attr_dev(div1, "id", "view");
    			add_location(div1, file, 705, 12, 17159);
    			attr_dev(div2, "id", "gazercontrolbar");
    			attr_dev(div2, "class", "svelte-1rwmkqc");
    			add_location(div2, file, 692, 4, 16605);
    			attr_dev(div3, "id", "streamcontrolbar");
    			attr_dev(div3, "class", "svelte-1rwmkqc");
    			add_location(div3, file, 708, 4, 17212);
    			attr_dev(div4, "class", "column svelte-1rwmkqc");
    			attr_dev(div4, "id", "controller");
    			add_location(div4, file, 713, 8, 17311);
    			attr_dev(div5, "class", "column svelte-1rwmkqc");
    			attr_dev(div5, "id", "streaming");
    			add_location(div5, file, 716, 8, 17411);
    			attr_dev(div6, "id", "movementcontrolbar");
    			attr_dev(div6, "class", "svelte-1rwmkqc");
    			add_location(div6, file, 711, 4, 17272);
    			attr_dev(div7, "id", "topbar");
    			attr_dev(div7, "class", "svelte-1rwmkqc");
    			add_location(div7, file, 691, 0, 16583);
    			attr_dev(video, "class", "underlay svelte-1rwmkqc");
    			attr_dev(video, "id", "tamaview");
    			add_location(video, file, 767, 8, 18421);
    			attr_dev(div8, "class", "focus svelte-1rwmkqc");
    			set_style(div8, "-webkit-mask", "radial-gradient(circle at " + /*blurPoint*/ ctx[1][0] + "% " + /*blurPoint*/ ctx[1][1] + "%, #00000000 250px, rgba(0, 0, 0, 0.9) 0px)");
    			add_location(div8, file, 769, 8, 18606);
    			attr_dev(img, "class", "overlay svelte-1rwmkqc");
    			add_location(img, file, 770, 8, 18763);
    			attr_dev(div9, "class", "blur-container svelte-1rwmkqc");
    			add_location(div9, file, 766, 4, 18384);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div7, anchor);
    			append_dev(div7, div2);
    			append_dev(div2, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div0, null);
    				}
    			}

    			append_dev(div2, t0);
    			append_dev(div2, form);
    			append_dev(form, input0);
    			append_dev(form, t1);
    			append_dev(form, input1);
    			append_dev(form, t2);
    			append_dev(form, input2);
    			append_dev(form, t3);
    			append_dev(form, input3);
    			append_dev(div2, t4);
    			append_dev(div2, div1);
    			append_dev(div7, t5);
    			append_dev(div7, div3);
    			mount_component(tama, div3, null);
    			append_dev(div7, t6);
    			append_dev(div7, div6);
    			append_dev(div6, div4);
    			mount_component(controller, div4, null);
    			append_dev(div6, t7);
    			append_dev(div6, div5);
    			mount_component(signaling, div5, null);
    			insert_dev(target, t8, anchor);
    			mount_component(gamepad, target, anchor);
    			insert_dev(target, t9, anchor);
    			insert_dev(target, div9, anchor);
    			append_dev(div9, video);
    			append_dev(div9, t10);
    			append_dev(div9, div8);
    			append_dev(div9, t11);
    			append_dev(div9, img);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(window_1, "keydown", onKeyDown, false, false, false, false),
    					listen_dev(window_1, "keyup", onKeyUp, false, false, false, false),
    					listen_dev(form, "submit", prevent_default(/*handleSubmit*/ ctx[8]), false, true, false, false),
    					listen_dev(img, "mousedown", /*onMouseDown*/ ctx[9], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*sendCol, collist*/ 1028) {
    				each_value = /*collist*/ ctx[10];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div0, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			const controller_changes = {};

    			if (!updating_movement && dirty[0] & /*movement*/ 1) {
    				updating_movement = true;
    				controller_changes.movement = /*movement*/ ctx[0];
    				add_flush_callback(() => updating_movement = false);
    			}

    			controller.$set(controller_changes);

    			if (!current || dirty[0] & /*blurPoint*/ 2) {
    				set_style(div8, "-webkit-mask", "radial-gradient(circle at " + /*blurPoint*/ ctx[1][0] + "% " + /*blurPoint*/ ctx[1][1] + "%, #00000000 250px, rgba(0, 0, 0, 0.9) 0px)");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(tama.$$.fragment, local);
    			transition_in(controller.$$.fragment, local);
    			transition_in(signaling.$$.fragment, local);
    			transition_in(gamepad.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(tama.$$.fragment, local);
    			transition_out(controller.$$.fragment, local);
    			transition_out(signaling.$$.fragment, local);
    			transition_out(gamepad.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div7);
    			destroy_each(each_blocks, detaching);
    			destroy_component(tama);
    			destroy_component(controller);
    			destroy_component(signaling);
    			if (detaching) detach_dev(t8);
    			destroy_component(gamepad, detaching);
    			if (detaching) detach_dev(t9);
    			if (detaching) detach_dev(div9);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function gamepadConnected(event) {
    	console.log(`app: gamepad ${event.detail.gamepadIndex} connected`);
    }

    function calculateVectorInfo(x, y) {
    	// Calculate the angle in radians
    	let angleRadians = Math.atan2(y, x);

    	// Convert radians to degrees
    	let angleDegrees = angleRadians * 180 / Math.PI;

    	// Ensure the angle is between 0 and 360 degrees
    	angleDegrees = (angleDegrees + 360) % 360;

    	// Calculate the length of the vector
    	let vectorLength = Math.sqrt(x * x + y * y);

    	// Return the result
    	return { angleDegrees, vectorLength };
    }

    function onKeyDown(e) {
    	if (e.repeat) return;

    	switch (e.key.toUpperCase()) {
    		case "W":
    			console.log("pressed W");
    			// forward
    			kmf = true;
    			//sendWheel('m',0);
    			e.preventDefault();
    			break;
    		case "S":
    			console.log("pressed s");
    			// stop
    			kmb = true;
    			e.preventDefault();
    			break;
    		case "A":
    			console.log("pressed s");
    			// forward
    			kml = true;
    			e.preventDefault();
    			break;
    		case "D":
    			console.log("pressed s");
    			// forward
    			kmr = true;
    			e.preventDefault();
    			break;
    		case "Q":
    			console.log("pressed q");
    			// forward
    			krl = true;
    			e.preventDefault();
    			break;
    		case "E":
    			console.log("pressed e");
    			// forward
    			krr = true;
    			e.preventDefault();
    			break;
    		case "G":
    			console.log("pressed e");
    			// forward
    			speedToggle = 1;
    			//krr = true;
    			e.preventDefault();
    			break;
    		case "H":
    			console.log("pressed e");
    			// forward
    			speedToggle = 3;
    			//krr = true;
    			e.preventDefault();
    			break;
    		case "J":
    			console.log("pressed e");
    			// forward
    			speedToggle = 6;
    			//krr = true;
    			e.preventDefault();
    			break;
    		case "K":
    			console.log("pressed e");
    			// forward
    			speedToggle = 7;
    			//krr = true;
    			e.preventDefault();
    			break;
    		case "T":
    			console.log("pressed e");
    			left = 40;
    			right = 59;
    			e.preventDefault();
    			break;
    		case "Y":
    			console.log("pressed e");
    			left = 42;
    			right = 57;
    			e.preventDefault();
    			break;
    		case "U":
    			console.log("pressed e");
    			// forward
    			left = 44;
    			right = 55;
    			e.preventDefault();
    			break;
    		case "I":
    			console.log("pressed e");
    			// forward
    			left = 45;
    			right = 55;
    			e.preventDefault();
    			break;
    		case "O":
    			console.log("pressed e");
    			// forward
    			left = 47;
    			right = 53;
    			e.preventDefault();
    			break;
    		case "P":
    			console.log("pressed e");
    			// forward
    			left = 49;
    			right = 51;
    			e.preventDefault();
    			break;
    		default:
    			console.log(e.key);
    	}

    	updateKeyMovement();
    }

    function onKeyUp(e) {
    	switch (e.key.toUpperCase()) {
    		case "W":
    			console.log("pressed W");
    			// forward
    			//sendWheel('m',32);
    			kmf = false;
    			e.preventDefault();
    			break;
    		case "S":
    			console.log("pressed s");
    			// forward
    			kmb = false;
    			e.preventDefault();
    			break;
    		case "A":
    			console.log("pressed s");
    			// forward
    			kml = false;
    			e.preventDefault();
    			break;
    		case "D":
    			console.log("pressed s");
    			// forward
    			kmr = false;
    			e.preventDefault();
    			break;
    		case "Q":
    			console.log("pressed q");
    			// forward
    			//sendWheel("r","M")
    			krl = false;
    			e.preventDefault();
    			break;
    		case "E":
    			console.log("pressed e");
    			// forward
    			//sendWheel("r","M")
    			krr = false;
    			e.preventDefault();
    			break;
    	}

    	updateKeyMovement();
    }

    // tried to use this for more continious moving gaze if the user
    // was using a touchscrene, but the eyes were a bit to slow for it
    // maybe can be tested again!
    function onMouseMove(event) {
    	
    } //getPoint(event)

    function onMouseUp() {
    	removeEventListener('mousemove', onMouseMove);
    	removeEventListener('mouseup', onMouseUp);
    } //getPoint(event)

    function createPeerConnection() {
    	try {
    		var pcConfig_ = pcConfig;

    		try {
    			ice_servers = document.getElementById('ice_servers').value;

    			if (ice_servers) {
    				pcConfig_.iceServers = JSON.parse(ice_servers);
    			}
    		} catch(e) {
    			alert(e + "\nExample: " + '\n[ {"urls": "stun:stun1.example.net"}, {"urls": "turn:turn.example.org", "username": "user", "credential": "myPassword"} ]' + "\nContinuing with built-in RTCIceServer array");
    		}

    		console.log(JSON.stringify(pcConfig_));
    		pc = new RTCPeerConnection(pcConfig_, pcOptions);
    		pc.onicecandidate = onIceCandidate;

    		if ('ontrack' in pc) {
    			pc.ontrack = onTrack;
    		} else {
    			pc.onaddstream = onRemoteStreamAdded; // deprecated
    		}

    		pc.onremovestream = onRemoteStreamRemoved;
    		pc.ondatachannel = onDataChannel;
    		console.log("peer connection successfully created!");
    	} catch(e) {
    		console.error("createPeerConnection() failed");
    	}
    }

    function onTrack(event) {
    	REMOTE_VIDEO_ELEMENT.srcObject = event.streams[0];
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	let newWizard = true;

    	async function sendOmniWheel(obj) {
    		if (newWizard) {
    			sendObjectWheel_pos();
    		} else {
    			var dataToSend = new FormData();
    			dataToSend.append("json", JSON.stringify(obj));
    			const res = await fetch('./omniwheels', { method: "POST", body: dataToSend });
    			const json = await res.json();
    			console.log(JSON.stringify(json));
    		}
    	}

    	async function sendWheel(action, direction) {
    		if (newWizard) {
    			sendSimpleWheel_pos();
    		} else {
    			var obj = { [action]: direction };
    			var dataToSend = new FormData();
    			dataToSend.append("json", JSON.stringify(obj));
    			const res = await fetch('./wheels', { method: "POST", body: dataToSend });
    			const json = await res.json();
    			console.log(JSON.stringify(json));
    		}
    	}

    	async function sendCol(color) {
    		if (newWizard) {
    			changeEyeColor(color);
    		} else {
    			console.log(color);
    			var obj = { 'c': color };
    			var dataToSend = new FormData();
    			dataToSend.append("json", JSON.stringify(obj));
    			const res = await fetch('./color', { method: "POST", body: dataToSend });
    			const json = await res.json();
    			console.log(JSON.stringify(json));
    		}
    	}

    	async function sendGaze(aX, aY) {
    		if (newWizard) {
    			moveHead(aX, aY);
    		} else {
    			gaze = "p" + aX + "t" + aY;
    			var obj = { 'g': gaze };
    			var dataToSend = new FormData();
    			dataToSend.append("json", JSON.stringify(obj));
    			const res = await fetch('./gaze', { method: "POST", body: dataToSend });
    			const json = await res.json();
    			console.log(JSON.stringify(json));
    		}
    	}

    	// ################ TAMA ################
    	let stateTama = { speed: 0, direction: 0, rotation: 0 };

    	let lastUpdate = { s: 0, d: 0, r: 0 };

    	// ################ GAMEPAD ################
    	let stateGamepad = {
    		leftAxis: { x: 0, y: 0 },
    		rightAxis: { x: 0, y: 0 },
    		button: { right: null, left: null },
    		right: 0,
    		left: 0,
    		speedtoggle: 1
    	};

    	function LeftStick(event) {
    		$$invalidate(13, stateGamepad.leftAxis = event.detail, stateGamepad);
    	}

    	function RightStick(event) {
    		$$invalidate(13, stateGamepad.rightAxis = event.detail, stateGamepad);
    	}

    	function RSPressed(event) {
    		if ($$invalidate(13, stateGamepad.speedtoggle = 1, stateGamepad)) {
    			$$invalidate(13, stateGamepad.speedtoggle = 0.5, stateGamepad);
    		} else {
    			$$invalidate(13, stateGamepad.speedtoggle = 1, stateGamepad);
    		}
    	}

    	function RBPressed(event) {
    		if (stateGamepad.button["right"] != event.detail) {
    			if (stateGamepad.button["right"] == null) {
    				$$invalidate(13, stateGamepad.right = 400, stateGamepad);
    			}

    			stateGamepad.button["right"] == event.detail;
    		} else {
    			$$invalidate(13, stateGamepad.right = 0, stateGamepad);
    		}
    	}

    	function LBPressed(event) {
    		if (stateGamepad.button["left"] != event.detail) {
    			if (stateGamepad.button["left"] == null) {
    				$$invalidate(13, stateGamepad.left = -400, stateGamepad);
    			}

    			stateGamepad.button["left"] == event.detail;
    		} else {
    			$$invalidate(13, stateGamepad.left = 0, stateGamepad);
    		}
    	}

    	let speed = 600;

    	// ################ KEYBOARD ################
    	let stateKeyboard = {
    		forward: 0,
    		left: 0,
    		right: 0,
    		back: 0,
    		rotate: 0,
    		rotatespeed: 0,
    		directionspeed: 0
    	};

    	// ################ UI ################
    	// function to handle the form submit
    	function handleSubmit(e) {
    		const formData = new FormData(e.target);
    		let data = { s: 0, d: 0, r: 0 };

    		for (let field of formData) {
    			let [key, value] = field;
    			data[key] = parseInt(value);
    		}

    		console.log(data);
    		sendOmniWheel(data);
    	}

    	let movement = 'rM';

    	// ################ GAZE CONTROLLER ################
    	// These are the blurring and gaze clicking functions
    	let blurPoint = [50, 50];

    	let clickPoint = [.5, .5];

    	function getPoint(e) {
    		// This takes in the point and moves the gaze, but also the unblurred point in the image prob could be done better (this i am translating values back and forth in a weird way), but it works
    		document.getElementById('tamaview');

    		clickPoint = [e.offsetX / e.target.width, e.offsetY / e.target.height];
    		$$invalidate(1, blurPoint = [clickPoint[0] * 100, clickPoint[1] * 100]);

    		// 0 -> 30 1->-30 ; 1-> 0
    		console.log("click point = " + clickPoint);

    		let aX = Math.floor((0.5 - clickPoint[0]) * 60);
    		let aY = Math.floor((1 - clickPoint[1]) * 48);
    		console.log("ax = " + aX);
    		console.log("ay = " + aY);
    		console.log("just test = ");
    		sendGaze(aX, aY);
    	} //angles = "p" + aX + "t" + aY;

    	function onMouseDown(event) {
    		addEventListener('mousemove', onMouseMove);
    		addEventListener('mouseup', onMouseUp);
    		getPoint(event);
    	}

    	let collist = [
    		{ id: "R", name: 'Red' },
    		{ id: "G", name: 'Green' },
    		{ id: "B", name: 'Blue' }
    	];

    	// ################ WEBSOCKETS ################
    	var raspi;

    	var myID;
    	let rand = 0;

    	function getRand() {
    		fetch("./rand").then(d => d.text()).then(d => rand = d);
    	}

    	// socketio
    	var protocol = window.location.protocol;

    	var socket = io(protocol + '//' + document.domain + ':' + location.port, { autoConnect: true });

    	// Send audio but not video to tamatoo
    	var Constraints = { audio: true, video: false };

    	// connect to socket server
    	socket = io.connect();

    	socket.on('connect', function () {
    		socket.emit('my event', { data: 'I\'m connected!' });
    	});

    	var signalling_server_hostname = location.hostname || "192.168.1.8";
    	var signalling_server_address = signalling_server_hostname + ':' + (9000 );

    	var MEDIA_CONSTRAINTS = {
    		optional: [],
    		mandatory: {
    			OfferToReceiveAudio: false,
    			OfferToReceiveVideo: true
    		}
    	};

    	var calldata = {
    		what: "call",
    		options: {
    			force_hw_vcodec: true,
    			vformat: 30,
    			trickle_ice: true
    		}
    	};

    	// Put variables in global scope to make them available to the browser console.
    	const audio = document.querySelector('audio');

    	const constraints = window.constraints = { audio: true, video: false };
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	const click_handler = col => sendCol(col.id);

    	function controller_movement_binding(value) {
    		movement = value;
    		$$invalidate(0, movement);
    	}

    	$$self.$capture_state = () => ({
    		Tama,
    		Controller,
    		Gamepad,
    		Signaling,
    		newWizard,
    		sendOmniWheel,
    		sendWheel,
    		sendCol,
    		sendGaze,
    		stateTama,
    		lastUpdate,
    		stateGamepad,
    		gamepadConnected,
    		LeftStick,
    		RightStick,
    		RSPressed,
    		RBPressed,
    		LBPressed,
    		calculateVectorInfo,
    		speed,
    		stateKeyboard,
    		onKeyDown,
    		onKeyUp,
    		handleSubmit,
    		movement,
    		blurPoint,
    		clickPoint,
    		getPoint,
    		onMouseMove,
    		onMouseDown,
    		onMouseUp,
    		collist,
    		raspi,
    		myID,
    		rand,
    		getRand,
    		protocol,
    		socket,
    		Constraints,
    		signalling_server_hostname,
    		signalling_server_address,
    		createPeerConnection,
    		MEDIA_CONSTRAINTS,
    		calldata,
    		onTrack,
    		audio,
    		constraints
    	});

    	$$self.$inject_state = $$props => {
    		if ('newWizard' in $$props) newWizard = $$props.newWizard;
    		if ('stateTama' in $$props) $$invalidate(11, stateTama = $$props.stateTama);
    		if ('lastUpdate' in $$props) $$invalidate(12, lastUpdate = $$props.lastUpdate);
    		if ('stateGamepad' in $$props) $$invalidate(13, stateGamepad = $$props.stateGamepad);
    		if ('speed' in $$props) $$invalidate(23, speed = $$props.speed);
    		if ('stateKeyboard' in $$props) stateKeyboard = $$props.stateKeyboard;
    		if ('movement' in $$props) $$invalidate(0, movement = $$props.movement);
    		if ('blurPoint' in $$props) $$invalidate(1, blurPoint = $$props.blurPoint);
    		if ('clickPoint' in $$props) clickPoint = $$props.clickPoint;
    		if ('collist' in $$props) $$invalidate(10, collist = $$props.collist);
    		if ('raspi' in $$props) raspi = $$props.raspi;
    		if ('myID' in $$props) myID = $$props.myID;
    		if ('rand' in $$props) rand = $$props.rand;
    		if ('protocol' in $$props) protocol = $$props.protocol;
    		if ('socket' in $$props) socket = $$props.socket;
    		if ('Constraints' in $$props) Constraints = $$props.Constraints;
    		if ('signalling_server_hostname' in $$props) signalling_server_hostname = $$props.signalling_server_hostname;
    		if ('signalling_server_address' in $$props) signalling_server_address = $$props.signalling_server_address;
    		if ('MEDIA_CONSTRAINTS' in $$props) MEDIA_CONSTRAINTS = $$props.MEDIA_CONSTRAINTS;
    		if ('calldata' in $$props) calldata = $$props.calldata;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*stateGamepad, stateTama*/ 10240) {
    			{
    				// This reactive statement will run whenever the state changes
    				let newDegrees = calculateVectorInfo(stateGamepad.leftAxis['x'], stateGamepad.leftAxis['y']).angleDegrees;

    				let newSpeed = Math.min(calculateVectorInfo(stateGamepad.leftAxis['x'], stateGamepad.leftAxis['y']).vectorLength * stateGamepad.speedtoggle, 1) * speed;

    				if (newSpeed == 0) {
    					if (stateTama.speed != 0) {
    						$$invalidate(11, stateTama.speed = 0, stateTama);
    					}

    					$$invalidate(11, stateTama.rotation = stateGamepad.right + stateGamepad.left, stateTama);
    				} else {
    					$$invalidate(11, stateTama.rotation = (stateGamepad.right + stateGamepad.left) * 0.75, stateTama);
    				}

    				if (Math.abs(stateTama.speed - newSpeed) > 0.1 * speed) {
    					$$invalidate(11, stateTama.speed = newSpeed, stateTama);
    				} //sendWheel('m',Math.round(speed*6)*speedmulti+32)
    				//isMoving = true;

    				newDegrees = Math.round((270 - newDegrees) / 11.25) * 11.25 % 360;

    				if (newDegrees != stateTama.direction) {
    					$$invalidate(11, stateTama.direction = newDegrees, stateTama);
    				} //sendWheel('m',Math.round(degrees/11.25))
    			}
    		}

    		if ($$self.$$.dirty[0] & /*stateTama, lastUpdate*/ 6144) {
    			{
    				let obj = {
    					s: stateTama.speed,
    					d: stateTama.direction,
    					r: stateTama.rotation
    				};

    				if (JSON.stringify(lastUpdate) != JSON.stringify(obj)) {
    					sendOmniWheel(obj);
    					$$invalidate(12, lastUpdate = obj);
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*stateGamepad*/ 8192) {
    			{
    				console.log(stateGamepad.right);
    			}
    		}
    	};

    	return [
    		movement,
    		blurPoint,
    		sendCol,
    		LeftStick,
    		RightStick,
    		RSPressed,
    		RBPressed,
    		LBPressed,
    		handleSubmit,
    		onMouseDown,
    		collist,
    		stateTama,
    		lastUpdate,
    		stateGamepad,
    		click_handler,
    		controller_movement_binding
    	];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {}, null, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.body,
    	props: {
    		name: 'world'
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
