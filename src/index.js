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
        const resultData = new Map()

        //subflowを探してライブラリ化
        for (const element of subflowJSON) {
            //subflowを探す
            if (element.type == "subflow") {
                const subflows = element
                const name = element.meta.module || element.name

                resultData[name] = { packageData: {}, subflows: {} }

                const packageData = {
                    "name": name,
                    "version": element.meta.version || "0.0.1",
                    "description": element.meta.desc || element.info || "",
                    "author": element.meta.author || "",
                    "license": element.meta.license || "",
                    "keywords": element.meta.keywords || "",
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
                        flow.type = name
                        if (flow.env) {
                            for (const env of flow.env) {
                                flow[env.name] = (env.type) ? { "type": env.type, "value": env.value || "" } : env.value || ""
                            }
                            delete flow.env
                        }
                    }
                    if (flow.z == subflows.id) {//flow.zがsubflowsのIDと同じ場合は、そのsubflowsに属している
                        subflows.flow.push(flow)
                    }
                }
                resultData[name].package = packageData
                resultData[name].subflows = subflows
                //subflows
                //      "id": "cd185f8f533e0f2d",
                //      "type": "subflow",
                ///"type": "subflow:cd185f8f533e0f2d",
            }
        }
        const subflowsid = {}
        //dependencies追加
        for (const key in resultData) {
            const subflows = resultData[key];
            subflowsid[subflows.subflows.id] = subflows //フローから削除するためのキー登録
            for (const flow of subflows.subflows.flow) {
                if (resultData[flow.type]) {
                    //フロー内で別のサブフローを使っていたら、dependenciesにそのサブフローを追加する
                    subflows.package.dependencies[flow.type] = resultData[flow.type].package.version
                }
            }
        }
        
        const flowJSON = JSON.parse(JSON.stringify(subflowJSON))
        //subflowに属してないflowのみにする
        resultData.flow = flowJSON.filter(element => !(subflowsid[element.z] || element.type == "subflow"));
        //console.log(result)
        return resultData
    }

    generate(resultData) {

        //subフローを削除したflows.jsonを出力
        fs.writeFileSync(path.join(process.cwd(), "output", "flows.json"), JSON.stringify(resultData.flow, null, '    '));

        for (const key in resultData) {
            const subflows = resultData[key];
            const outputdir = path.join(process.cwd(), "output",key)
            if(!fs.existsSync(outputdir)){
                fs.mkdirSync(outputdir,{ recursive: true });
            }
            
            fs.writeFileSync(path.join(outputdir,`${key}.json`), JSON.stringify(subflows.subflows, null, '    '));
            fs.writeFileSync(path.join(outputdir,'package.json'), JSON.stringify(subflows.package, null, '    '));
        }
        

        var view = {
            title: "Joe",
            calc: function () {
                return 2 + 4;
            }
        };

        //console.log(Handlebars)
        const template = Handlebars.compile("{{title}} spends {{calc}}");
        console.log(template(view))

        const templatedir = path.join(process.cwd(), "template")
        this.dirwalk(templatedir, (basepath, currentpath, file) => {
            console.log("dirwalk:", basepath, currentpath, file)
        })
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
