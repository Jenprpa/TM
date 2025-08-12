// This script acts as a simple backend for the Second Brain application,
// using a Google Sheet as the database.

// --- CONFIGURATION ---
const SHEETS = {
  tasks: "Tasks",
  projects: "Projects",
  areas: "Areas",
  notes: "Notes",
};

// --- MAIN HANDLERS ---

/**
 * Handles GET requests.
 * The only supported action is 'getAll' to fetch all data.
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === 'getAll') {
      const data = {
        areas: getDataFromSheet(SHEETS.areas),
        projects: getDataFromSheet(SHEETS.projects),
        tasks: getDataFromSheet(SHEETS.tasks),
        notes: getDataFromSheet(SHEETS.notes),
      };
      return createJsonResponse({ success: true, data: data });
    } else {
      throw new Error("Unsupported GET action.");
    }
  } catch (error) {
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * Handles POST requests for Create, Update, Delete (CUD) operations.
 */
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const { action, data } = request;

    if (!action || !data) {
      throw new Error("Invalid request: 'action' and 'data' are required.");
    }
    
    let result;
    const sheetName = getSheetNameFromAction(action);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

    switch (true) {
      case action.startsWith('create'):
        result = createRecord(sheet, data);
        break;
      case action.startsWith('update'):
        result = updateRecord(sheet, data);
        break;
      case action.startsWith('delete'):
        result = deleteRecord(sheet, data.id);
        break;
      default:
        throw new Error(`Unsupported POST action: ${action}`);
    }
    
    // Using no-cors on the frontend means we won't get this response,
    // but it's good practice to return a status.
    return createJsonResponse({ success: true, message: "Action completed.", result: result });

  } catch (error) {
    return createJsonResponse({ success: false, error: error.message });
  }
}

// --- HELPER FUNCTIONS ---

/**
 * Creates a JSON response object.
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Determines the sheet name based on the action string.
 * e.g., "createTask" -> "Tasks"
 */
function getSheetNameFromAction(action) {
    if (action.toLowerCase().includes('task')) return SHEETS.tasks;
    if (action.toLowerCase().includes('project')) return SHEETS.projects;
    if (action.toLowerCase().includes('area')) return SHEETS.areas;
    if (action.toLowerCase().includes('note')) return SHEETS.notes;
    throw new Error(`Could not determine sheet from action: ${action}`);
}


/**
 * Converts all data from a given sheet into an array of objects.
 */
function getDataFromSheet(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  if (values.length < 2) return []; // Only headers or empty

  const headers = values[0].map(h => h.toLowerCase());
  const data = values.slice(1).map(row => {
    let obj = {};
    headers.forEach((header, i) => {
      // Format dates correctly for JSON
      if (row[i] instanceof Date) {
        obj[header] = row[i].toISOString().split('T')[0];
      } else {
        obj[header] = row[i];
      }
    });
    return obj;
  });
  return data;
}

/**
 * Creates a new record in the specified sheet.
 */
function createRecord(sheet, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const newId = `id_${new Date().getTime()}`;
  data.id = newId;
  const newRow = headers.map(header => data[header.toLowerCase()] || "");
  sheet.appendRow(newRow);
  return data;
}

/**
 * Updates an existing record in the sheet based on its ID.
 */
function updateRecord(sheet, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idColumnIndex = headers.findIndex(h => h.toLowerCase() === 'id') + 1;
  if (idColumnIndex === 0) throw new Error("'id' column not found.");

  const dataValues = sheet.getRange(2, idColumnIndex, sheet.getLastRow() - 1, 1).getValues();
  let rowToUpdate = -1;
  for (let i = 0; i < dataValues.length; i++) {
    if (dataValues[i][0] == data.id) {
      rowToUpdate = i + 2; // +2 because sheet is 1-indexed and we sliced headers
      break;
    }
  }

  if (rowToUpdate === -1) throw new Error(`Record with ID ${data.id} not found.`);

  const updatedRow = headers.map(header => data[header.toLowerCase()] !== undefined ? data[header.toLowerCase()] : "");
  sheet.getRange(rowToUpdate, 1, 1, headers.length).setValues([updatedRow]);
  return data;
}

/**
 * Deletes a record from the sheet based on its ID.
 */
function deleteRecord(sheet, id) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idColumnIndex = headers.findIndex(h => h.toLowerCase() === 'id') + 1;
  if (idColumnIndex === 0) throw new Error("'id' column not found.");
  
  const dataValues = sheet.getRange(2, idColumnIndex, sheet.getLastRow() - 1, 1).getValues();
  let rowToDelete = -1;
  for (let i = 0; i < dataValues.length; i++) {
    if (dataValues[i][0] == id) {
      rowToDelete = i + 2;
      break;
    }
  }

  if (rowToDelete > -1) {
    sheet.deleteRow(rowToDelete);
    return { id: id, status: 'deleted' };
  } else {
    throw new Error(`Record with ID ${id} not found for deletion.`);
  }
}
