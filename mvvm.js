//基类 调度
class Compiler{
    constructor(el, vm){
        //判断el属性，是不是一个元素，如果不是元素，那就获取他
        this.el = this.isElementNode(el) ? el : document.querySelector(el);
        //把当前节点中的元素，获取并放入内存
        this.vm = vm;
        let fragment = this.node2Fragment(this.el);
        //把节点中的内容进行替换
        //用数据编译模板
        this.compile(fragment);
        //把内容再塞回dom中
        this.el.appendChild(fragment)
    }
    //编译内存中的dom节点
    compile(node){
        //找第一层子节点
        let childNodes = node.childNodes;
        //进行分类
        [...childNodes].forEach(child => {
            if(this.isElementNode(child)){ //元素节点
                this.compileElement(child)
                //递归子节点
                if(child.hasChildNodes()){
                    this.compile(child)
                }
            }else{ //文本节点
                this.compileText(child)
            }
        })
    }
    //是否是指令
    isDirective(attrName){
        return attrName.startsWith("v-");
    }
    //编译元素
    compileElement(node){
        let attributes = node.attributes; //拿到节点属性，是个类数组
        [...attributes].forEach(attr => { //attr形式：attr=value
            let {name:name, value:expr} = attr; //解构，拿到键和值
            //判断如果是指令
            if(this.isDirective(name)){ //拿到指令  name=v-model
                let [,directive] = name.split('-');
                let [directiveName, eventName] = directive.split(":") //v-on:click
                CompileUtil[directiveName](node, expr, this.vm, eventName); //调用不同的处理方法来处理指令
            }
        })
    }
    //编译文本
    compileText(node){
        //判断当前文本节点中内容是否包含{{}}这种语法
        let content = node.textContent;
        if(/\{\{(.+?)\}\}/.test(content)){ //.+? 非贪婪模式匹配
            CompileUtil['text'](node, content, this.vm); // {{a}} {{b}}
        }
    }
    //把节点移动到内存中
    node2Fragment(node){
        //创建文档碎片
        let fragment = document.createDocumentFragment();
        let firstChild;
        while(firstChild = node.firstChild){
            //appendChild具有移动性, 每append一次原node对应的dom就少一个
            fragment.appendChild(firstChild)
        }
        return fragment;
    }
    //是不是元素节点
    isElementNode(node){
        return node.nodeType === 1
    }
}

const CompileUtil = {
    //根据表达式，取对应的数据值
    getVal(vm, expr){ //vm.$data = 'school.name' [school, name]
        return expr.split('.').reduce((data, current)=>{
            return data[current]; //触发该属性的get()
        }, vm.$data)
    },
    //根据表达式，设置值
    setVal(vm, expr, value){
        expr.split('.').reduce((data, current, index, arr)=>{
            if(index == arr.length-1){
                data[current] = value; //给最后一次遍历得到的内存区域设置新值
            }
            return data[current];
        }, vm.$data)
    },
    //遍历表达式，将内容重新替换成一个完整的内容
    getContentVal(vm, expr){
        return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
            return this.getVal(vm, args[1])
        })
    },
    //解析v-model
    model(node, expr, vm){ //node节点，expr是表达式，vm是vue实例
        let fn = this.updater['modelUpdater'];
        //拿到vm.$data里需要的值
        let value = this.getVal(vm, expr);
        fn(node, value);
        new Watcher(vm, expr, (newVal) => { //加观察者，之后数据更新，用新值给dom赋值
            fn(node, newVal);
        })
        //给输入元素绑定事件
        node.addEventListener('input', (e) => {
            let value = e.target.value; //得到用户输入的内容
            this.setVal(vm, expr, value)
        })
    },
    html(node, expr, vm){
        let fn = this.updater['htmlUpdater'];
        //拿到vm.$data里需要的值
        let value = this.getVal(vm, expr);
        new Watcher(vm, expr, (newVal) => {
            fn(node, newVal);
        })
        fn(node, value);
    },
    text(node, expr, vm){ //expr => {{school.name}} {{school.age}}
        let fn = this.updater['textUpdater'];
        let content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
            new Watcher(vm, args[1], () => { //给表达式里的每个{{}}都加上观察者，之后数据更新，用新值给dom赋值
                fn(node, this.getContentVal(vm ,expr));
            })
            return this.getVal(vm, args[1]) //args[1] => school.name
        })
        fn(node, content);
    },
    on(node, expr, vm ,eventName){ //expr函数名
        node.addEventListener(eventName, (e)=>{
            vm[expr].call(vm, e); //修正this，指向vm
        })
    },
    updater:{
        //把数据插入到节点中
        modelUpdater(node, value){
            node.value = value;
        },
        //改写节点里的html内容
        htmlUpdater(node, value){
            node.innerHTML = value;
        },
        //修改文本节点内容
        textUpdater(node, value){
            node.textContent = value;
        }
    }
}

//订阅管理器
class Dep {
    constructor(obj, key){
        this.key = key;
        this.obj = obj;
        this.subs = []; //存放所有的watcher实例
    }
    //订阅
    subscribe(watcher){
        this.subs.push(watcher);
    }
    //发布
    notify(){
        this.subs.forEach(watcher => watcher.update());
    }
}

//观察者
class Watcher {
    constructor(vm, expr, callback){
        this.vm = vm;
        this.expr = expr;
        this.callback = callback;
        //默认先存放一个老值
        this.oldValue = this.get()
    }
    //取出旧值
    get(){
        Dep.target = this; //利用js单线程执行的特性，在创建watcher实例时，把实例挂到Dep上暂存起来
        let value = CompileUtil.getVal(this.vm, this.expr); //取旧的值，这步会触发Observer赋予属性的get()方法
        Dep.target = null; //此时已完成订阅，清除实例
        return value
    }
    //更新操作，数据变化后，会调用观察者的update方法
    update(){
        let newVal = CompileUtil.getVal(this.vm, this.expr);
        if(newVal != this.oldValue) {
            this.oldValue = newVal; //更新旧值
            this.callback(newVal);
        }
    }
}

//数据劫持
class Observer{
    constructor(data){
        this.observer(data)
    }
    observer(data){
        //如果是对象才劫持
        if(data && typeof data == 'object'){
            for(let key in data){
                this.defineReactive(data, key, data[key]);
            }
        }
    }
    defineReactive(obj, key, value){
        //给每个属性都加上一个发布订阅管理器
        let dep = new Dep(obj, key);
        Object.defineProperty(obj, key, {
            get(){
                Dep.target && dep.subscribe(Dep.target); //取值时，把watcher加入到属性各自的发布订阅管理器里。当初始化完成后，Dep.target已被清理，此后的get()都不会触发订阅
                return value;
            },
            set: (newVal)=>{ //school
                //只有新旧值不同才会发生set操作
                if(value != newVal){
                    this.observer(newVal); //如果是对象也给他生成get set
                    value = newVal;
                    dep.notify(); //值发生改变时，进行发布
                }
            }
        })
        this.observer(value)
    }
}

class Vue {
    constructor(options){
        this.$el = options.el;
        this.$data = options.data;
        let computed = options.computed;
        this.methods = options.methods;
        //根元素存在，编译模板
        if(this.$el){
            //把data全部转化成用Object.defineProperty来定义
            new Observer(this.$data);

            //把computed里的方法绑定到vm.$data上
            for(let key in computed){
                Object.defineProperty(this.$data, key, {
                    get:()=>{ //对它的取值会触发添加订阅
                        return computed[key].call(this) //修改方法执行时的this，令他指向vm。
                    }
                })
            }
            //把methods里的方法绑定到vm上
            for(let key in this.methods){
                Object.defineProperty(this, key, {
                    get(){ //对它的取值不会触发添加订阅
                        return this.methods[key];
                    }
                })
            }

            //把vm上的取值操作代理到vm.$data
            this.proxyVM()

            //编译模板
            new Compiler(this.$el, this);
        }
    }
    proxyVM(){
        for(let key in this.$data){
            Object.defineProperty(this, key, {
                get(){ //垫一步，从vm上取key的值，相当于从vm.$data取
                    return this.$data[key]
                },
                set(newVal){
                    this.$data[key] = newVal
                }
            })
        }
    }
}