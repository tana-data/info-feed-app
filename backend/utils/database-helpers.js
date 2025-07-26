/**
 * Database Helper Utilities
 * 
 * Common database operations and utilities to reduce code duplication
 * and provide consistent error handling across database interactions.
 */

const db = require('../models/database');

/**
 * Promisified version of db.get for easier async/await usage
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Promise resolving to the result row
 */
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Promisified version of db.all for easier async/await usage
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Promise resolving to the result rows
 */
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Promisified version of db.run for easier async/await usage
 * @param {string} sql - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Promise resolving to run result with lastID and changes
 */
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({
          lastID: this.lastID,
          changes: this.changes
        });
      }
    });
  });
}

/**
 * Check if a record exists in a table
 * @param {string} table - Table name
 * @param {string} whereClause - WHERE clause (without WHERE keyword)
 * @param {Array} params - Query parameters
 * @returns {Promise<boolean>} Promise resolving to true if record exists
 */
async function recordExists(table, whereClause, params = []) {
  try {
    const sql = `SELECT 1 FROM ${table} WHERE ${whereClause} LIMIT 1`;
    const result = await dbGet(sql, params);
    return !!result;
  } catch (error) {
    throw error;
  }
}

/**
 * Get record count from a table with optional conditions
 * @param {string} table - Table name
 * @param {string} whereClause - Optional WHERE clause (without WHERE keyword)
 * @param {Array} params - Query parameters
 * @returns {Promise<number>} Promise resolving to record count
 */
async function getRecordCount(table, whereClause = '', params = []) {
  try {
    const sql = whereClause 
      ? `SELECT COUNT(*) as count FROM ${table} WHERE ${whereClause}`
      : `SELECT COUNT(*) as count FROM ${table}`;
    const result = await dbGet(sql, params);
    return result.count || 0;
  } catch (error) {
    throw error;
  }
}

/**
 * Insert a new record and return the inserted record with its ID
 * @param {string} table - Table name
 * @param {Object} data - Data to insert (keys are column names)
 * @returns {Promise<Object>} Promise resolving to the inserted record
 */
async function insertRecord(table, data) {
  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await dbRun(sql, values);
    
    // Return the inserted record
    const insertedRecord = await dbGet(`SELECT * FROM ${table} WHERE id = ?`, [result.lastID]);
    return insertedRecord;
  } catch (error) {
    throw error;
  }
}

/**
 * Update a record by ID
 * @param {string} table - Table name
 * @param {number} id - Record ID
 * @param {Object} data - Data to update (keys are column names)
 * @returns {Promise<Object>} Promise resolving to the updated record
 */
async function updateRecord(table, id, data) {
  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    await dbRun(sql, [...values, id]);
    
    // Return the updated record
    const updatedRecord = await dbGet(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return updatedRecord;
  } catch (error) {
    throw error;
  }
}

/**
 * Delete a record by ID
 * @param {string} table - Table name
 * @param {number} id - Record ID
 * @returns {Promise<boolean>} Promise resolving to true if record was deleted
 */
async function deleteRecord(table, id) {
  try {
    const result = await dbRun(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return result.changes > 0;
  } catch (error) {
    throw error;
  }
}

/**
 * Execute multiple SQL statements in a transaction
 * @param {Array<{sql: string, params: Array}>} statements - Array of SQL statements with parameters
 * @returns {Promise<Array>} Promise resolving to array of results
 */
async function transaction(statements) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const results = [];
      let completed = 0;
      let hasError = false;
      
      statements.forEach((stmt, index) => {
        db.run(stmt.sql, stmt.params, function(err) {
          if (err && !hasError) {
            hasError = true;
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          if (!hasError) {
            results[index] = {
              lastID: this.lastID,
              changes: this.changes
            };
            
            completed++;
            if (completed === statements.length) {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  reject(commitErr);
                } else {
                  resolve(results);
                }
              });
            }
          }
        });
      });
    });
  });
}

/**
 * Get paginated results from a table
 * @param {string} table - Table name
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @param {string} whereClause - Optional WHERE clause (without WHERE keyword)
 * @param {Array} params - Query parameters
 * @param {string} orderBy - Optional ORDER BY clause (without ORDER BY keyword)
 * @returns {Promise<{data: Array, total: number, page: number, limit: number}>}
 */
async function getPaginatedResults(table, page = 1, limit = 10, whereClause = '', params = [], orderBy = 'id DESC') {
  try {
    // Get total count
    const total = await getRecordCount(table, whereClause, params);
    
    // Calculate offset
    const offset = (page - 1) * limit;
    
    // Build query
    let sql = `SELECT * FROM ${table}`;
    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }
    if (orderBy) {
      sql += ` ORDER BY ${orderBy}`;
    }
    sql += ` LIMIT ? OFFSET ?`;
    
    const data = await dbAll(sql, [...params, limit, offset]);
    
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  } catch (error) {
    throw error;
  }
}

module.exports = {
  dbGet,
  dbAll,
  dbRun,
  recordExists,
  getRecordCount,
  insertRecord,
  updateRecord,
  deleteRecord,
  transaction,
  getPaginatedResults
};