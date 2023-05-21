import Handlebars from 'handlebars'
import fs from 'fs'
import path from 'path'

//import { commander } from 'Commander';
const commander = require('commander');

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
        const fullpath = path.join(process.cwd(), flowpath)
        const flowContents = fs.readFileSync(fullpath);
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
                    "dependencies": {
                        "node-red-job-util": "0.0.1"
                    }
                }
                packageData['node-red'].nodes[name] = "index.js"

                subflows.flow = []
                for (const flow of subflowJSON) {
                    if (flow.type == `subflow:${subflows.id}`) {//flow.typeがsubflowsのIDと同じ場合は、そのsubflowsを使っている
                        flow.type = subflows.meta.type

                        for (const env of subflows.env) {
                            const _env = (flow.env && flow.env[env.name] )?flow.env[env.name]:{type:null,value:null}
                            flow[env.name] = { "type": _env.type || env.type, "value": _env.value || env.value || "" }
                            //flow[env.name] = (env.type && env.type!="str") ? { "type": env.type, "value": env.value || "" } : env.value || ""
                            //flow[env.name] = { "type": env.type, "value": env.value || "" } 
                        }
                        delete flow.env

                        // if (flow.env) {
                        //     for (const env of flow.env) {
                        //         //flow[env.name] = (env.type && env.type!="str") ? { "type": env.type, "value": env.value || "" } : env.value || ""
                        //         //flow[env.name] = { "type": env.type, "value": env.value || "" } 
                        //         flow[env.name] = { "type": env.type, "value": env.value || "" }
                        //     }
                        //     delete flow.env
                        // }

                    }
                    if (flow.z == subflows.id) {//flow.zがsubflowsのIDと同じ場合は、そのsubflowsに属している
                        subflows.flow.push(flow)
                    }
                }
                subflowData[name].package = packageData
                subflowData[name].subflows = subflows
                //subflows
                //      "id": "cd185f8f533e0f2d",
                //      "type": "subflow",
                ///"type": "subflow:cd185f8f533e0f2d",
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
        //console.log(result)
        return resultData
    }

    generate(resultData) {

        const subflowData = resultData["subflowData"]
        const flowData = resultData["flowData"]
        //subフローを削除したflows.jsonを出力
        const outputdir = path.join(process.cwd(), "output")
        if (!fs.existsSync(outputdir)) {
            fs.mkdirSync(outputdir, { recursive: true });
        }
        fs.writeFileSync(path.join(outputdir, 'flows.json'), JSON.stringify(flowData, null, '    '));
        for (const key in subflowData) {
            const subflows = subflowData[key];
            const outputsubflowdir = path.join(process.cwd(), 'output', key, 'subflow')
            const outputdir = path.join(process.cwd(), 'output', key)
            if (!fs.existsSync(outputsubflowdir)) {
                fs.mkdirSync(outputsubflowdir, { recursive: true });
            }

            fs.writeFileSync(path.join(outputsubflowdir, `${key}.json`), JSON.stringify(subflows.subflows, null, '    '))
            fs.writeFileSync(path.join(outputdir, 'package.json'), JSON.stringify(subflows.package, null, '    '))
            const index_js = fs.readFileSync(path.join(process.cwd(), 'template', 'index.js'), 'utf-8')
            fs.writeFileSync(path.join(outputdir, 'index.js'), index_js)

            const README_md = fs.readFileSync(path.join(process.cwd(), 'template', 'README.md'), 'utf-8')
            const template = Handlebars.compile(README_md)
            fs.writeFileSync(path.join(outputdir, 'README.md'), template(subflows.package))
        }

        //const templatedir = path.join(process.cwd(), "template")
        //this.dirwalk(templatedir, (basepath, currentpath, file) => {
        //    console.log("dirwalk:", basepath, currentpath, file)
        //})
    }

}


commander
    .version('0.0.1')
    .requiredOption('-f, --file <path>', 'File to upload')
    .parse(process.argv);

console.log(commander.opts())

const options = commander.opts();

const test = new GenerateLib()


const resultData = test.readflow(options.file)
test.generate(resultData)
