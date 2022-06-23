<script src="./sidebar-main.js"></script>

<template><div id="sidebar">

    <!-- Head Controls -->

    <div id="head-controls">
        <div class="buttons">
            <div>
                <button class="blue plain-button fas fa-plus" @click="newTemplate" title="Create new template"></button>
                <button class="plain-button fas fa-arrows-alt-h" @click="sendMessage('togglePosition')"
                    title="Toggle sidebar position"></button>
                <button class="plain-button fas fa-list" @click="openTemplatesView" title="Show all archived templates"></button>
                <button class="plain-button fas fa-pencil-alt" @click="openJsonEditor" title="Edit template as JSON"></button>
                <button class="plain-button far fa-clone" :disabled="!this.templates[this.template.id]" @click="cloneCurrentTemplate"
                    title="Clone current template"></button>
                <button class="plain-button fas fa-fast-backward" @click="revertTemplate" title="Undo all modifications" :disabled="!stashedTemplate || !templateEdited"></button>
            </div>
            <button class="red plain-button fas fa-times" @click="sendMessage('close')"></button>
        </div>
        <div class="title">
            <label for="template-title" class="left">Template: </label>
            <input class="template-title" id="template-title" @input="onTemplateTitleInput" v-model="template.page"/>
        </div>
    </div>

    <!-- Fields List -->

    <div id="field-list">
        <div :key="i"
            class="field"
            ref="field"
            :class="{picking:field===pickingField}"
            v-for="(field, i) in template.fields"
            @mouseenter="sendMessage('highlight', field.selector)"
            @mouseleave="sendMessage('unhighlight')">

            <div class="inner" >
                <div class="top">
                    <select v-model="field.attachTo.on" class="text">
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                    </select>
                    <button @click="onPickerClick(field, $event)"
                            class="orange plain-button fas fa-magic"
                            title="Start picker"
                            @keypress.prevent>
                            </button>
                    <button class="plain-button far fa-clone"
                            title="Clone field"
                            @click="cloneField(i)">
                            </button>
                    <button :disabled="i === fields.length-1"
                            class="plain-button far fa-circle"
                            title="Reset selector"
                            @click="resetSelector(field)">
                            </button>
                    <button class="plain-button fas fa-minus"
                            :disabled="i === fields.length-1"
                            @click="removeField(i)">
                            </button>
                </div>
                <div class="bottom">
                    <input v-model.trim="field.attachTo.element"
                           class="selector"
                           placeholder="css or xpath"
                           :class="{error:fieldCovers[i] === -1}"
                           @input="onSelectorInput(field)"
                           @keyup.enter="onSelectorEnter(field)">
                    <span :disabled="i === fields.length-1" class="amount">{{ fieldCovers[i] === -1 ? 0 : fieldCovers[i] }}</span>
                </div>
                <div class="bottom">
                    <input v-model.trim="field.title"
                           class="text"
                           placeholder="title"
                           :class="{error:fieldCovers[i] === -1}">
                </div>
                <div class="bottom">
                    <textarea v-model.trim="field.text"
                              placeholder="content" 
                              rows="2"
                              :class="{error:fieldCovers[i] === -1}"> 
                    </textarea>
                </div>
                <div v-if="i !== fields.length-1" class="indicator" :class="[fieldCovers[i] === undefined ? 'unknown' : (fieldCovers[i] > 0 ? 'good' : 'bad')]"></div>
                <div v-else class="indicator"></div>

                <!-- Idea for supporting custom buttons -->
<!--                <div class="bottom">-->
<!--                    <button v-model.trim="field.linkButton"-->
<!--                            class="text">-->
<!--                        Read More-->
<!--                    </button>-->
<!--                </div>-->
<!--                <div class="bottom">-->
<!--                    <input v-model.trim="field.link"-->
<!--                           class="text"-->
<!--                           placeholder="link url">-->
<!--                </div>-->
            </div>
        </div>
    </div>

    <!-- Configuration View -->

    <div class="modal-overlay" @click.self="resetView();onOptionsEdited()" v-if="confView">
        <div id="conf">
            <div class="settings">
                <label><input v-model="options.autonojs" type="checkbox">Automatically disable JavaScript.</label>
            </div>
            <b>Data Tab:</b><br>
            In picking mode data previews show a few special properties alongside element real attributes.<br>
            Those are:<br>
            _html - element inner html.<br>
            _tag - element tag name (e.g. "a", "div", "span").<br>
            _text - list of element direct texts (e.g. <span style="color: #af4356">&lt;span&gt;hello &lt;b&gt;to&lt;/b&gt; you&lt;/span&gt;</span> will be ["hello ", " you"]).<br>
            _val - value under special nonstandard css pseudo elements if used (e.g. "div a::attr(href)"), these are supported by scrapy for example.<br><br>
            <b>Hotkeys:</b><br>
            Left/Right Arrow Keys - toggle sidebar position.<br>
            Backspace, Delete - (in picking mode) reset current selector.<br>
            Esc - dismiss current popup or turn off picking mode.<br>
        </div>
    </div>

    <!-- Templates List -->

    <div class="modal-overlay" @click.self="resetView" v-if="templatesView">
        <div id="templates-list">
            <div class="buttons">
                <label class="custom-file-picker plain-button" title="Import new templates from file">
                    <input type="file" @change="importTemplates($event)"/>import
                </label>
                <div class="sep"></div>
                <button class="plain-button" @click="exportTemplates" :disabled="!selectedTemplates.length" title="Save templates to file">export</button>
                <button class="plain-button" @click="removeSelectedTemplates" :disabled="!selectedTemplates.length">delete</button>
                <button class="plain-button" @click="selectAllTemplates" >{{selectedTemplates.length ? 'none' : 'all'}}</button>
            </div>
            <div class="list">
                <div v-for="(t, i) in sortedTemplates"
                    :title="t.page" :key="t.id"
                    @click="selectTemplate(t)"
                    @dblclick="pickTemplate(t)"
                    :class="{selected:selectedTemplates.includes(t.id)}" class="template">
                    <div class="title">{{ t.page }}</div>
                    <div class="stat" :class="[templateStat[i].matchPower]">{{ templateStat[i].selCount }}</div>
                </div>
            </div>
        </div>
    </div>

    <!-- Template Json Editor -->

    <div class="modal-overlay" @click.self="resetView" v-if="jsonEditorView">
        <div id="json-editor">
            <div class="buttons">
                <button class="plain-button" @click="copyJsonEditor">copy</button>
                <button class="plain-button" @click="resetJsonEditor" :disabled="jsonEditorIsReset">reset</button>
                <button class="plain-button" @click="applyJsonEditor" :disabled="jsonEditorIsReset">apply</button>
            </div>
            <textarea ref="jsonEditor" v-model="jsonEditorText" @input="jsonEditorIsReset = false"></textarea>
        </div>
    </div>

</div></template>
