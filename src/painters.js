/**
 * ESUI (Enterprise Simple UI)
 * Copyright 2013 Baidu Inc. All rights reserved.
 * 
 * @file 渲染器模块
 * @author otakustay
 */

define(
    function (require) {
        var lib = require('./lib');

        var painters = {};

        /**
         * 修改状态
         *
         * @param {string} name 指定负责的属性名，同时也是状态名称
         */
        painters.state = function (name) {
            return {
                name: name,
                paint: function (control, value) {
                    var method = value ? 'addState' : 'removeState';
                    control[method](this.name);
                }
            };
        };

        /**
        * 修改元素属性
        *
        * @param {string} name 指定负责的属性名
        * @param {string=} attribute 对应DOM属性的名称，默认与`name`相同
        * @param {*=} value 指定DOM属性的值，默认与更新的值相同
        */
        painters.attribute = function (name, attribute, value) {
            return {
                name: name,
                attribute: attribute || name, 
                value: value,
                paint: function (control, value) {
                    value = this.value == null ? value : this.value;
                    control.main.setAttribute(this.attribute, value);
                }
            };
        };

        // 这些属性不用加`px`
        var unitProperties = {
            width: true,
            height: true,
            top: true,
            right: true,
            bottom: true,
            left: true,
            fontSize: true,
            padding: true,
            paddingTop: true, 
            paddingRight: true,
            paddingBottom: true,
            paddingLeft: true,
            margin: true,
            marginTop: true,
            marginRight: true,
            marginBottom: true,
            marginLeft: true,
            borderWidth: true,
            borderTopWidth: true,
            borderRightWidth: true,
            borderBottomWidth: true,
            borderLeftWidth: true
        };

        /**
         * 修改`main`元素的样式
         *
         * @param {string} name 指定负责的属性名
         * @param {string=} property 对应的样式属性名，默认与`name`相同
         */
        painters.style = function (name, property) {
            return {
                name: name,
                property: property || name,
                paint: function (control, value) {
                    if (value == null) {
                        return;
                    }
                    if (unitProperties.hasOwnProperty(this.property)) {
                        value = value === 0 ? '0' : value + 'px';
                    }
                    control.main.style[this.property] = value;
                }
            };
        };

        /**
         * 修改指定成员的`innerHTML`
         *
         * @param {string} name 指定负责的属性名
         * @param {string=|function=} element 指定DOM元素在当前控件下的id，
         * 注意这个id并不是DOM元素的真实id，而是控件的id之后的部分，默认为空字符串
         * @param {function=} generate 指定生成HTML的函数
         */
        painters.html = function (name, element, generate) {
            return {
                name: name,
                element: element || '',
                generate: generate,
                paint: function (control, value) {
                    var element = typeof this.element === 'function'
                        ? this.element(control)
                        : this.element
                            ? control.helper.getPart(this.element)
                            : control.main;
                    if (element) {
                        var html = typeof this.generate === 'function'
                            ? this.generate(control, value)
                            : value;
                        element.innerHTML = html || '';
                    }
                }
            };
        };

        /**
         * 修改指定成员的`innerText`
         *
         * @param {string} name 指定负责的属性名
         * @param {string=|function=} element 指定成员，默认为空字符串
         * @param {function=} generate 指定生成HTML的函数，
         * 该函数只返回HTML，不需要转义
         */
        painters.text = function (name, element, generate) {
            return {
                name: name,
                element: element || '',
                generate: generate,
                paint: function (control, value) {
                    var element = typeof this.element === 'function'
                        ? this.element(control)
                        : this.element
                            ? control.helper.getPart(this.element)
                            : control.main;
                    if (element) {
                        var html = typeof this.generate === 'function'
                            ? this.generate(control, value)
                            : value;
                        element.innerHTML = lib.encodeHTML(html || '');
                    }
                }
            };
        };


        /**
         * 将修改代理到指定成员的指定方法上
         *
         * @param {string} name 指定负责的属性名
         * @param {string} member 指定成员名
         * @param {string} method 指定调用的方法名称
         */
        painters.delegate = function (name, member, method) {
            return {
                name: name,
                member: this.member,
                method: this.method,
                paint: function (control, value) {
                    control[this.member][this.method](value);
                }
            };
        };

        /**
         * 通过`painter`对象创建`repaint`方法
         *
         * @param {...Object | function} args `painter`对象
         * @return {function} `repaint`方法的实现
         */
        painters.createRepaint = function () {
            var painters = [].concat.apply([], [].slice.call(arguments));

            return function (changes, changesIndex) {
                // 临时索引，不能直接修改`changesIndex`，会导致子类的逻辑错误
                var index = lib.extend({}, changesIndex);
                for (var i = 0; i < painters.length; i++) {
                    var painter = painters[i];

                    // 如果是一个函数，就认为这个函数处理所有的变化，直接调用一下
                    if (typeof painter === 'function') {
                        painter.apply(this, arguments);
                        continue;
                    }

                    // 其它情况下，走的是`painter`的自动化属性->函数映射机制
                    var propertyNames = [].concat(painter.name);

                    // 以下2种情况下要调用：
                    // 
                    // - 第一次重会（没有`changes`）
                    // - `changesIndex`有任何一个负责的属性的变化
                    var shouldPaint = !changes;
                    if (!shouldPaint) {
                        for (var j = 0; j < propertyNames.length; j++) {
                            var name = propertyNames[j];
                            if (changesIndex.hasOwnProperty(name)) {
                                shouldPaint = true;
                                break;
                            }
                        }
                    }
                    if (!shouldPaint) {
                        continue;
                    }

                    // 收集所有属性的值
                    var properties = [this];
                    for (var j = 0; j < propertyNames.length; j++) {
                        var name = propertyNames[j];
                        properties.push(this[name]);
                        // 从索引中删除，为了后续构建`unpainted`数组
                        delete index[name]; 
                    }
                    // 绘制
                    painter.paint.apply(painter, properties);
                }

                // 构建出未渲染的属性集合
                var unpainted = [];
                for (var key in index) {
                    if (index.hasOwnProperty(key)) {
                        unpainted.push(index[key]);
                    }
                }

                return unpainted;
            };
        };

        return painters;
    }
);
