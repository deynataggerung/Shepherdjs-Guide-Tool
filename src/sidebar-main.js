import Vue from 'vue'
import _ from 'lodash'
import MainComponent from './sidebar-main.vue'
import WindowBus from './bus.js'
import Selector from './selector.js'


// Template - main data model for this application:
// [
//     {
//         fields: [
//             {
//                  attachTo: { element: '', on: ''},
//                  title: '',
//                  text: '',
//             },
//             ...
//         ],
//         page: '',
//         urls: ['', ...] // pages template was ever edited on
//     },
//     ...
// ]

const htmlAttrImportance = [
    '_val', 'value', 'href', 'src', 'title', 'alt', 'name', 'html', '_text',
    attr => attr.startsWith('data-'),
    attr => !attr.startsWith('on')
]

const parentBus = new WindowBus()

// Utils
////////////////////////////////////////////////////////////////////////////////

function toBooleanSorters (sorters) {
    return sorters.map(sorter => _.isFunction(sorter) ? _.negate(sorter) : v => v != sorter)
}

function no3w (string) {
    return string.replace(/^www\./, '')
}

// Main
////////////////////////////////////////////////////////////////////////////////

export default {
    data () { return {
        template: {}, // current template
        templates: [], // all templates
        loc: null, // page location
        selCovers: {}, // number of element each selector covers
        pickingField: null, // field that selector picker is active on

        stashedTemplate: null, // stashed copy of current template (for revert)
        templateEdited: false,
        selectedTemplates: [],

        jsDisabled: null,
        options: {
            autonojs: false
        },

        // TODO:low just one var - currentView
        jsonEditorView: false,
        controlTabsView: false,
        templatesView: false,
        confView: false,

        jsonEditorText: '',
        jsonEditorIsReset: true,

        controlTab: 'data',

        selElemAttrs: [], // [[[attrName, attrVale]...], ...]
        selElemUniqAttrs: [], // [attrName, ...]
        attrToShow: null,
    }},
    created: async function () {

        // setup communication with the page
        parentBus.setReceiver(window.parent)
        Object.keys(this).filter(k => k.startsWith('remote_')).forEach(k => {
            // TODO:low remote_ to exposed_ or something to match the parent
            let kk = k.slice('remote_'.length)
            parentBus.handlers[kk] = this[k].bind(this)
        })
        parentBus.listen()

        this.sendMessage('isJsDisabled').then(v => this.jsDisabled = v)

        // retrieve config and templates
        let storage = await this.sendMessage('loadStorage')
        this.options = Object.assign({}, this.options, storage['options'] || {})
        Object.entries(storage).forEach(([k,v]) => {
            if (!k.startsWith('_')) return
            let [id, t] = [k, v]
            this.augmentTemplate(t, id)
            Vue.set(this.templates, id, t)
        })

        // test all available template selectors on current page
        this.checkAndUpdateSelectors(this.getAllSelectors(this.templates))

        // get page url
        this.loc = new URL(await this.sendMessage('getLocation'))

        // get best matching template
        let id = await this.findTemplate()

        if (!id) {
            this.newTemplate().then();
        } else {
            this.template = this.templates[id]
            this.stashedTemplate = _.cloneDeep(this.template)
        }
    },
    mounted: function () {
        window.addEventListener('keyup', e => this.onKeyUp(e))
        this.$el.style = '' // show everything
    },
    computed: {
        fields () {
            return this.template.fields || []
        },
        fieldCovers () {
            // selCovers but accessing from fields
            return this.fields.map(f => this.selCovers[f.attachTo.element])
        },
        sortedTemplates () {
            if (!this.loc) return []
            return _.sortBy(_.values(this.templates), [
                        t => t !== this.template, // current template
                        t => no3w(t.lastLoc.hostname) !== no3w(this.loc.hostname), // same host
                        t => no3w(t.lastLoc.host) // hostname alphabetic
                    ])
        },
        sortedSelElemAttrs () {
            if (!this.selElemAttrs.length) return []
            let sorters = _.concat(toBooleanSorters(htmlAttrImportance), _.identity)
            let pairsSorters = sorters.map(s => v => s(v[0]))
            return this.selElemAttrs.map(attrs => {
                return _.sortBy(_.toPairs(attrs), pairsSorters)
            })
        },
        templateStat () {
            return _.values(this.sortedTemplates).map(t => {
                let liveSels = '?'
                let matchPower = 'low'
                let fields = t.fields.slice(0, -1)
                let hasUndefined = _.find(fields, f => this.selCovers[f.attachTo.element] === undefined)
                if (!hasUndefined) {
                    liveSels = _.filter(fields, f => this.selCovers[f.attachTo.element] > 0).length
                    if (liveSels > 0) matchPower = 'medium'
                    if (liveSels === fields.length) matchPower = 'high'
                } else {
                    matchPower = 'unknown'
                }

                return {selCount: liveSels + '/' + (fields.length), matchPower: matchPower}
            })
        },
    },
    methods: {

        onKeyUp (e) {
            // note: on remote call from parent window e.target will not be set

            let isRoot = _.includes([undefined, document.body], e.target)

            if (e.keyCode === 27) {
                // esc
                this.resetView()
            } else if (_.includes([8,46], e.keyCode) && isRoot && this.pickingField) {
                // backspace
                this.resetSelector(this.pickingField)
            } else if (_.includes([37,39], e.keyCode) && isRoot) {
                // < and > arrow keys
                this.sendMessage('togglePosition')
            }
        },
        sendMessage (event, data) {
            // cooperate with our content script in the page
            return parentBus.sendMessage(event, data)
        },
        resetView () {
            this.disablePicker()
            this.controlTabsView = false
            this.jsonEditorView = false
            this.templatesView = false
            this.confView = false
        },
        getAllSelectors (templates) {
            return _.chain(templates).values()
                    .flatMap(t => t.fields.map(f => f.attachTo.element))
                    .uniq().value()
        },
        onOptionsEdited () {
            this.sendMessage('saveStorage', {options: this.options})
        },
        remote_resetView () {this.resetView()},
        remote_keyUp(e) {this.onKeyUp(e)},

        // Template Management

        makeTemplate (augment) {
            let page = this.loc.hash.replace(/#\//, '');
            page = page.split('/').filter(p => isNaN(Number.parseInt(p, 10))).join('/');
            return {
                fields: [],
                page: page,
                created: Date.now(),
                urls: [this.loc.href],
            }
        },
        augmentTemplate (t, id) {
            t.id = id ? id : '_' + Date.now()
            t.lastLoc = new URL(_.last(t.urls) || this.loc.href)
            t.fields.push(this.makeField())
        },
        cloneCurrentTemplate () {
            let t = _.cloneDeep(this.template)
            t.id = '_' + Date.now()
            t.page += ' New'
            this.template = t
            this.commitTemplate()
            this.templateEdited = false
        },
        revertTemplate () {
            if (!confirm('Undo all edits made to this template?')) return
            this.resetView()
            this.template = this.stashedTemplate
            this.stashedTemplate = _.cloneDeep(this.template)
            Vue.set(this.templates, this.template.id, this.template)
            this.templateEdited = false
        },
        async newTemplate () {
            this.loc = new URL(await this.sendMessage('getLocation'))
            this.resetView()
            this.template = this.makeTemplate()
            this.stashedTemplate = null
            this.augmentTemplate(this.template)
        },
        openTemplatesView () {
            this.commitTemplate()
            this.resetView()
            this.templatesView = true
        },
        pickTemplate (t) {
            this.template = t
            this.stashedTemplate = _.cloneDeep(this.template)
            this.checkAndUpdateSelectors()
            this.templatesView = false
        },
        removeSelectedTemplates () {
            this.templates = _.omit(this.templates, this.selectedTemplates)
            this.sendMessage('removeStorageKeys', this.selectedTemplates)
            this.selectedTemplates = []
        },
        selectTemplate (t) {
            if (_.includes(this.selectedTemplates, t.id))
                this.selectedTemplates = _.without(this.selectedTemplates, t.id)
            else
                this.selectedTemplates.push(t.id)
        },
        selectAllTemplates () {
            if (this.selectedTemplates.length) this.selectedTemplates = []
            else this.selectedTemplates = _.keys(this.templates)
        },
        commitTemplate () {
            this.templateEdited = true
            if (!_.includes(this.template.urls, this.loc.href))
                this.template.urls.push(this.loc.href)
            Vue.set(this.templates, this.template.id, this.template)
            let template = _.pick(this.template, ['page', 'fields', 'created', 'urls'])
            template.fields = template.fields.slice(0, -1) // remove ghost field
            this.sendMessage('saveStorage', {[this.template.id]: template})
        },
        // TODO: fix this to just use the template variable
        findTemplate () {
            // looks for template matching this page

            return new Promise(async resolve => {

                // filter out outside domain templates
                let candidates = _.pickBy(this.templates, t => {
                    return t.lastLoc.hostname === this.loc.hostname
                })

                let id2sels = _.mapValues(candidates, t => _.map(t.fields, 'selector'))
                let uniqSels = _.chain(id2sels).values().flatMap().uniq().value()

                let data = await this.sendMessage('checkSelectors', uniqSels)

                // count amount of working on this page selectors for each template
                var counted = Object.entries(id2sels).map(([id,sels]) => {
                    return [id, sels.filter(s => data[s]).length]
                })
                counted.sort((a,b) => b[1] - a[1])
                let top = counted[0]

                if (top && top[1] > 0) {
                    resolve(top[0])
                    return
                }

                // if no templates found try to find template
                // with a url (hostname+pathname) match
                let id = _.findKey(candidates, t => {
                    return (t.lastLoc.hostname + t.lastLoc.pathname) === (this.loc.hostname + this.loc.pathname)
                })
                resolve(id)
            })
        },
        onTemplateTitleInput: _.debounce(function () {this.commitTemplate()}, 300),

        // Fields/Selectors Management

        makeField () {
            return {attachTo: {element: '', on: ''}, title: '', text: ''}
        },
        addField () {
            this.template.fields.push(this.makeField())
            this.commitTemplate()
        },
        removeField (idx) {
            if (this.fields[idx] === this.pickingField) this.disablePicker()
            this.template.fields.splice(idx, 1)
            this.commitTemplate()
        },
        onPickerClick (f, e) {
            if (f === _.last(this.fields)) this.addField()

            e.target.blur()
            if (!this.pickingField) this.enablePicker(f)
            else if (this.pickingField === f) this.disablePicker()
            else {
                this.disablePicker()
                this.enablePicker(f)
            }
        },
        enablePicker (f) {
            this.sendMessage('enablePicker')
            this.pickingField = f
            this.controlTabsView = true
            this.submitSelector(f.attachTo.element)
            this.getSelElemAttrs(f.attachTo.element)

            let idx = _.findIndex(this.fields, ff => ff === f)
            setTimeout(() => {
                // if (this.$refs) {
                //     let fbox = this.$refs.field[idx].getBoundingClientRect()
                //     // let cbox = this.$refs.controlTabs.getBoundingClientRect()
                //
                //     let scrollBy = (fbox.y + fbox.height + fbox.height*.85)
                //     if (scrollBy > 0) this.$el.scrollTop += scrollBy
                // }
            }, 100)
        },
        disablePicker () {
            this.sendMessage('disablePicker')
            this.controlTabsView = false
            this.pickingField = null
        },
        submitSelector (sel) {
            this.sendMessage('changeSelectorPicked', sel)
        },
        onSelectorInput (f) {
            if (f === _.last(this.fields)) this.addField()
            this._onSelectorInput(f)
        },
        _onSelectorInput: _.debounce(function (f) {
            let sel = f.attachTo.element
            this.checkAndUpdateSelectors([sel])
            this.sendMessage('highlight', sel)
            this.commitTemplate()
            if (this.pickingField)
                this.getSelElemAttrs(sel)
        }, 300),
        onSelectorEnter (f) {
            if (f === this.pickingField)
                this.submitSelector(f.attachTo.element)
        },
        onFieldNameInput (f) {
            if (f === _.last(this.fields)) this.addField()
            this._onFieldNameInput()
        },
        _onFieldNameInput: _.debounce(function () {this.commitTemplate()}, 300),
        async checkAndUpdateSelectors (sels) {
            if (!sels) sels = this.template.fields.map(f => f.attachTo.element)
            let data = await this.sendMessage('checkSelectors', sels)
            this.selCovers = Object.assign({}, this.selCovers, data)
        },
        async getSelElemAttrs (sel) {
            let data = await this.sendMessage('getSelElemAttrs', sel)
            let sorters = _.concat(toBooleanSorters(htmlAttrImportance), _.identity)

            this.selElemAttrs = data
            this.selElemUniqAttrs = _.chain(data)
                .flatMap(_.keys).uniq().sortBy(sorters).value()
            this.attrToShow = this.selElemUniqAttrs[0]
        },
        cloneField (idx) {
            this.template.fields.splice(idx, 0, _.cloneDeep(this.fields[idx]))
            this.commitTemplate()
        },
        resetSelector (f) {
            if (!f) return
            f.attachTo.element = ''
            this.onSelectorInput(f)
            if (f === this.pickingField)
                this.submitSelector(f.attachTo.element)
        },
        remote_selectorPicked (sel) {
            if (this.pickingField)
                this.pickingField.attachTo.element = sel
            this.commitTemplate()
            this.getSelElemAttrs(sel)
            // don't mess with this line even if it makes little sense here
            this.checkAndUpdateSelectors([sel])
        },

        // Import/Export

        async exportTemplates () {
            let storage = await this.sendMessage('loadStorage')
            let templates = _.pick(storage, this.selectedTemplates)
            let templateArray = []
            for (let template in templates) {
                if (templates.hasOwnProperty(template)) {
                    // Check for duplicate guides for a single page and keep the newest one
                    let duplicateIndex = templateArray.findIndex(t => t.page === templates[template].page)
                    if (duplicateIndex >= 0) {
                        if (templateArray[duplicateIndex].created > templates[template].created) {
                            templateArray.splice(duplicateIndex, 1);
                        } else {
                            continue;
                        }
                    }
                    templateArray.push(templates[template])
                }
            }
            let content = JSON.stringify(templateArray, null, 2)
            this.sendMessage('saveText', content)
        },
        importTemplates (e) {
            let file = e.target.files[0]
            if (file.type !== 'application/json') {
                alert(`Incorrect file type of "${file.name}": ${file.type}\nExpected: application/json`)
                return
            }
            let reader = new FileReader()
            reader.addEventListener('load', e => {
                try {
                    let object = JSON.parse(reader.result)
                    this.commitImportedTemplates(object).then()
                } catch (e) {
                    alert(`Import failed: ${e}\nCheck console for details.`)
                    throw e
                }
            })
            // TODO:low report problem with loading it or something?
            reader.readAsText(file)
        },
        // TODO: fix import to match final export format
        async commitImportedTemplates (object) {
            this.loc = new URL(await this.sendMessage('getLocation'))
            let templates = Object.entries(object).map(([id,t]) => {
                id = id.toString()
                if (!id.startsWith('_')) id = '_' + id
                let tt = this.makeTemplate()
                tt.urls = t.urls.map(s => s.toString())
                tt.page = t.page.toString()
                tt.fields = t.fields.map(f => {
                    let ff = this.makeField()
                    ff.attachTo = {element: f.attachTo.element.toString(), on: f.attachTo.on.toString()}
                    ff.title = f.title.toString()
                    ff.text = f.text.toString()
                    return ff
                })
                if (this.templates[id])
                    console.log(`TessituraGuides will overwrite ${id}:`, tt)
                else
                    console.log(`TessituraGuides will create ${id}:`, tt)
                return [id, tt]
            })
            this.sendMessage('saveStorage', _.fromPairs(templates))
            templates.forEach(([id,t]) => {
                this.augmentTemplate(t, id)
                Vue.set(this.templates, id, t)
            })
            this.checkAndUpdateSelectors(this.getAllSelectors(_.fromPairs(templates)))
        },

        // Field JSON editor

        openJsonEditor () {
            this.resetView()
            this.resetJsonEditor()
            this.jsonEditorView = true
        },
        applyJsonEditor () {
            try {
                let data = JSON.parse(this.jsonEditorText)
                let fields = []
                Object.entries(data).forEach((v) => {
                    let f = this.makeField()
                    f.attachTo = {element: v.attachTo.element, on: v.attachTo.on}
                    f.title = v.title
                    f.text = v.text[0]
                    fields.push(f)
                })
                this.template.fields = fields
                this.fields.push(this.makeField())
                this.commitTemplate()
                this.checkAndUpdateSelectors()
                this.jsonEditorView = false
                this.resetJsonEditor()
            } catch (e) {
                alert('Failed to apply specified json: ' + e)
                throw e
            }
        },
        resetJsonEditor () {
            this.jsonEditorIsReset = true
            let object = this.template.fields.slice(0, -1).map(f => {
                return {attachTo: {element: f.attachTo.element, on: f.attachTo.on}, title: f.title, text: [f.text]}
            })
            this.jsonEditorText = JSON.stringify(object, null, 2)
        },
        copyJsonEditor () {
            this.$refs.jsonEditor.select()
            document.execCommand('copy')
        },
    }
}