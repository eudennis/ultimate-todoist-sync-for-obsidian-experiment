import { TodoistApi } from "@doist/todoist-api-typescript"
import { App} from 'obsidian';
import AnotherSimpleTodoistSync from "../main";
    //convert date from obsidian event
    // 使用示例
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDatetimeString(str);
    //console.log(dateStr); // 输出 2023-03-27T00:00:00.000Z

function  localDateStringToUTCDatetimeString(localDateString:string) {
        
        // Let's see what this function is receiving
        // console.log("Here it receives localDateString: " + localDateString)

        try {
          if(localDateString === null){
            return null
          }
          
          const localDateObj = new Date(localDateString);
          const ISOString = localDateObj.toISOString()
          return(ISOString);
        } catch (error) {
          console.error(`Error extracting date from string '${localDateString}': ${error}`);
          return null;
        }
}


export class TodoistRestAPI  {
	app:App;
  plugin: AnotherSimpleTodoistSync;

	constructor(app:App, plugin:AnotherSimpleTodoistSync) {
		//super(app,settings);
		this.app = app;
    this.plugin = plugin;
	}


    initializeAPI(){
        const token = this.plugin.settings.todoistAPIToken
        const api = new TodoistApi(token)
        return(api)
    }

    async AddTask({ projectId, content, parentId, dueDate, dueTime, dueDatetime,labels, description,priority,duration,duration_unit }: { projectId: string, content: string, parentId?: string , dueDate?: string, dueTime?: string, dueDatetime?: string, labels?: Array<string>, description?: string,priority?:number, duration?: number,duration_unit?: string }) {
        const api = await this.initializeAPI()
        try {
          
          // console.log(`dueDate = ${dueDate} and dueTime = ${dueTime} and dueDatetime = ${dueDatetime}`)

          const taskData: any ={
            projectId,
            content,
            parentId,
            dueDate,
            labels,
            description,
            priority
          };
          
          // Check if duration is a number, not null and not a NaN. Case it doesn't, the duration is not provided to the request
          if (duration !== null && typeof duration === 'number' && !isNaN(duration)) {
            // console.log("The task has a valid duration")
            taskData.duration = duration;
            taskData.duration_unit = duration_unit;
          }
          

          // If there is a dueTime, merge dueDate and dueTime and convert it to UTC, if not, returns only the date
          if(dueTime){
            // if(this.plugin.settings.debugMode){
            //   console.log("dueDate = " + dueDate)
            //   console.log("dueTime = " + dueTime)
            // }

            const dueDateAndTimeMerge = dueDate + "T" + dueTime

            // if(this.plugin.settings.debugMode){console.log("dueDateAndTimeMerge = " + dueDateAndTimeMerge)}
            
            dueDatetime = localDateStringToUTCDatetimeString(dueDateAndTimeMerge) || undefined
            // if(this.plugin.settings.debugMode){console.log("dueDateTime after transformation to UTCDateTimeString = " + dueDatetime)}
            dueDate = undefined

            taskData.dueDate = dueDate
            taskData.dueDatetime = dueDatetime
          }

          // console.log(`taskData = ${JSON.stringify(taskData)}`)
          

          const newTask = await api.addTask(taskData);

          return newTask;
        } catch (error) {
          throw new Error(`Error adding task: ${error.message}`);
        }
    }


    //options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}
    async GetActiveTasks(options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}) {
      const api = await this.initializeAPI()
      try {
        const result = await api.getTasks(options);
        return result;
      } catch (error) {
        throw new Error(`Error get active tasks: ${error.message}`);
      }
    }


    //Also note that to remove the due date of a task completely, you should set the due_string parameter to no date or no due date.
    //api 没有 update task project id 的函数
    async UpdateTask(taskId: string, updates: { content?: string, description?: string, labels?:Array<string>,dueDate?: string,dueTime?: string,dueDatetime?: string,dueString?:string,parentId?:string,priority?:number,duration?: string,duration_unit?: string }) {
        const api = await this.initializeAPI()
        if (!taskId) {
          throw new Error('taskId is required');
        }
        if (!updates.content && !updates.description &&!updates.dueDate && !updates.dueDatetime && !updates.dueString && !updates.labels &&!updates.parentId && !updates.priority && !updates.duration && !updates.duration_unit) {
          throw new Error('At least one update is required');
        }
        try {

        if(!updates.dueTime){
          delete updates.dueTime
        }
        if(!updates.dueString){
          delete updates.dueString
        }
        if(updates.dueDate && updates.dueTime){
            const dueDateAndTimeMerge = updates.dueDate + "T" + updates.dueTime;
            updates.dueDatetime = localDateStringToUTCDatetimeString(dueDateAndTimeMerge) || undefined;
            // TODO need to delete due date?
            // updates.dueDate = null
            delete updates.dueDate
            // console.log("value of updates.dueDatime =" + updates.dueDatetime)
          }  
          // if(updates.dueDate && !updates.dueTime){
          //   const dueDateAndTimeMerge = updates.dueDate + "T00:00:00";
          //   updates.dueDatetime = localDateStringToUTCDatetimeString(dueDateAndTimeMerge) || undefined;
          // }

          if(updates.duration){
            // updates.duration = `"duration":{"duration":${updates.duration},"unit":"minute"}`;
            // console.log("updates.duration = " + updates.duration)
            updates.duration_unit = "minute";
          }

          // console.log(`updates.duration = ${updates.duration} and updates.duration_unit = ${updates.duration_unit}`)

          // TODO The content still logs with whitespaces after so it keep looping trying to update the content
          if(this.plugin.settings.debugMode){console.log(`updates = ${JSON.stringify(updates)}`)}

          
        const updatedTask = await api.updateTask(taskId, updates);
        return updatedTask;
        } catch (error) {
        throw new Error(`Error updating task: ${error.message}`);
        }
    }

    //open a task
    async OpenTask(taskId:string) {
        const api = await this.initializeAPI()
        try {
    
        const isSuccess = await api.reopenTask(taskId);
        // console.log(`Task ${taskId} is reopend`)
        return(isSuccess)
    
        } catch (error) {
            console.error('Error open a  task:', error);
            return
        }
    }

    // Close a task in Todoist API
    async CloseTask(taskId: string): Promise<boolean> {
        const api = await this.initializeAPI()
        try {
        const isSuccess = await api.closeTask(taskId);
        // if(this.plugin.settings.debugMode){console.log(`Task ${taskId} is closed`)}
        return isSuccess;
        } catch (error) {
        console.error('Error closing task:', error);
        throw error; // 抛出错误使调用方能够捕获并处理它
        }
    }
  
    

 
    // get a task by Id
    async getTaskById(taskId: string) {
        const api = await this.initializeAPI()
        if (!taskId) {
        throw new Error('taskId is required');
        }
        try {
        const task = await api.getTask(taskId);
        return task;
        } catch (error) {
          if (error.response && error.response.status) {
            const statusCode = error.response.status;
            throw new Error(`Error retrieving task. Status code: ${statusCode}`);
          } else {
            throw new Error(`Error retrieving task: ${error.message}`);
          }
        }
    }

    //get a task due by id
    async getTaskDueById(taskId: string) {
        const api = await this.initializeAPI()
        if (!taskId) {
        throw new Error('taskId is required');
        }
        try {
        const task = await api.getTask(taskId);
        const due = task.due ?? null
        return due;
        } catch (error) {
        throw new Error(`Error updating task: ${error.message}`);
        }
    }


    //get all projects
    async GetAllProjects() {
        const api = await this.initializeAPI()
        try {
        const result = await api.getProjects();
        return(result)
    
        } catch (error) {
            console.error('Error get all projects', error);
            return false
        }
    }


}





















