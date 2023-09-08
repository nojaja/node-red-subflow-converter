import Handlebars from 'handlebars'
import fs from 'fs'
import path from 'path'
//import { commander } from 'commander'
const commander = require('commander')

export class GenerateLib {

    dirwalk(basepath, callback) {
        function _dirwalk(basepath, currentpath, callback) {
            const fullpath = (currentpath) ? path.join(basepath, currentpath) : basepath
            fs.readdir(fullpath, function (err, files) {
                //if (err) throw err;
                if (err) console.error("err:", err)
                for (const file of files) {
                    const filepath = path.join(fullpath, file)
                    if (fs.statSync(filepath).isFile()) {
                        callback(basepath, currentpath, file)
                    } else {
                        _dirwalk(basepath, (currentpath) ? path.join(currentpath, file) : file, callback)
                    }
                }
            })
        }
        return _dirwalk(basepath, null, callback)
    }

    readflow(flowpath) {
        const fullpath = path.resolve(flowpath)//path.join(process.cwd(), flowpath)
        const isProjectpath = fs.statSync(fullpath).isDirectory()

        const packageInfo = (isProjectpath) ? JSON.parse(fs.readFileSync(path.join(fullpath, 'package.json'))) : {
            dependencies: {}, "node-red": {
                "settings": {
                    "flowFile": "flows.json",
                    "credentialsFile": "flows_cred.json"
                }
            }
        }
        const dependencies = packageInfo.dependencies
        const flowFile = packageInfo["node-red"].settings.flowFile
        const flowPath = (isProjectpath) ? path.join(fullpath, flowFile) : fullpath

        const flowContents = fs.readFileSync(flowPath);
        const subflowJSON = JSON.parse(flowContents);
        const subflowData = new Map()
        const resultData = new Map()

        //subflowを探してライブラリ化
        for (const element of subflowJSON) {
            //subflowを探す
            if (element.type == "subflow") {
                const subflows = element
                const name = element.meta.module || element.name
                subflowData[name] = { packageData: {}, subflows: {} }

                // Create package.json definition information
                const packageData = {
                    "name": name,
                    "version": subflows.meta.version || "0.0.1",
                    "description": subflows.meta.desc || subflows.info || "",
                    "main": "index.js",
                    "author": subflows.meta.author || "",
                    "license": subflows.meta.license || "",
                    "keywords": subflows.meta.keywords || "",
                    "node-red": {
                        "nodes": {}
                    },
                    "dependencies": dependencies
                }
                packageData['node-red'].nodes[name] = "index.js"

                subflows.flow = []
                for (const flow of subflowJSON) {

                    //Convert the part using subflow to the calling definitions after library conversion
                    if (flow.type == `subflow:${subflows.id}`) {//flow.typeがsubflowsのIDと同じ場合は、そのsubflowsを使っている
                        flow.type = subflows.meta.type

                        //インスタンス側の設定値取得
                        const _flowenv = {}
                        for (const env of flow.env || []) {
                            _flowenv[env.name] = { "type": env.type, "value": env.value }
                        }

                        //Sets the environment variables. If there is no value for an environment variable in the instance, the default value defined in the subflow will be used.
                        for (const prototype_env of subflows.env) {
                            const _env = _flowenv[prototype_env.name] || { type: null, value: null }
                            flow[prototype_env.name] = { "type": _env.type || prototype_env.type, "value": _env.value || prototype_env.value || "" }
                            //console.log("env: instance:",_env," prototype:",prototype_env)
                        }
                        delete flow.env
                    }

                    //Move definition belonging to subflow under subflow
                    if (flow.z == subflows.id) {//flow.zがsubflowsのIDと同じ場合は、そのsubflowsに属している
                        subflows.flow.push(flow)
                    }
                }
                subflowData[name].package = packageData
                subflowData[name].subflows = subflows
            }
        }
        const subflowsid = {}
        //dependencies追加
        for (const key in subflowData) {
            const subflows = subflowData[key];
            subflowsid[subflows.subflows.id] = subflows //フローから削除するためのキー登録
            for (const flow of subflows.subflows.flow) {
                if (subflowData[flow.type]) {
                    //フロー内で別のサブフローを使っていたら、dependenciesにそのサブフローを追加する
                    subflows.package.dependencies[flow.type] = subflowData[flow.type].package.version
                }
            }
        }

        resultData["subflowData"] = subflowData

        const flowJSON = JSON.parse(JSON.stringify(subflowJSON))
        //subflowに属してないflowのみにする
        resultData["flowData"] = flowJSON.filter(element => !(subflowsid[element.z] || element.type == "subflow"));

        return resultData
    }

    //Output a file based on analysis results
    generate(resultData, outputPath) {
        const subflowData = resultData["subflowData"]
        const flowData = resultData["flowData"]
        //subフローを削除したflows.jsonを出力
        //const outputdir = path.join(process.cwd(), "output")
        const outputdir = path.resolve(outputPath) || process.cwd()

        if (!fs.existsSync(outputdir)) {
            fs.mkdirSync(outputdir, { recursive: true });
        }

        //Output flow.json excluding subflow elements
        fs.writeFileSync(path.join(outputdir, 'flows.json'), JSON.stringify(flowData, null, '    '));

        //Output for each subflow
        for (const key in subflowData) {
            const subflows = subflowData[key];
            const subflowdir = path.join(outputdir, 'node_modules', key)
            const outputsubflowdir = path.join(subflowdir, 'subflow')
            if (!fs.existsSync(outputsubflowdir)) {
                fs.mkdirSync(outputsubflowdir, { recursive: true });
            }

            // output subflow.json
            fs.writeFileSync(path.join(outputsubflowdir, `${key}.json`), JSON.stringify(subflows.subflows, null, '    '))

            // output package.json
            fs.writeFileSync(path.join(subflowdir, 'package.json'), JSON.stringify(subflows.package, null, '    '))

            // output index.js

            const index_js = fs.readFileSync(path.join(__dirname, '../template', 'index.js'), 'utf-8')
            fs.writeFileSync(path.join(subflowdir, 'index.js'), index_js)

            // output README.md
            const README_md = fs.readFileSync(path.join(__dirname, '../template', 'README.md'), 'utf-8')
            const template = Handlebars.compile(README_md)
            fs.writeFileSync(path.join(subflowdir, 'README.md'), template(subflows.package))
        }
    }

}


commander
    .version('0.0.1')
    .requiredOption('-f, --file <path>', 'flow.json or flow project path')
    .option('-o, --output <path>', 'Output path defaults to the current directory')
    .parse(process.argv);

const options = commander.opts();
const gen = new GenerateLib()
const resultData = gen.readflow(options.file)
gen.generate(resultData, options.output)
