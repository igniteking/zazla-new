export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { getAuth } from "@clerk/nextjs/server";
import { CandidateData, WorkExperience } from "@/shared/types/types";

export async function GET(req: NextRequest) {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  try {
    const { userId: authUserId } = getAuth(req); // Get userId from the request

    if (!authUserId) {
      console.error("User not authenticated");
      return NextResponse.json(
        { error: "User authentication failed" },
        { status: 401 }
      );
    }

    // Fetch logged user ID from the database
    const [loggedUserResults] = await connection.execute(
      "SELECT id FROM users WHERE clerk_id = ?",
      [authUserId]
    );

    const loggedUserId = (loggedUserResults as mysql.RowDataPacket[])[0]?.id;
    if (!loggedUserId) {
      console.error("Logged User ID is undefined or null");
      return NextResponse.json(
        { error: "Logged User ID not found" },
        { status: 400 }
      );
    }

    // Query all candidate IDs for the logged user
    const [candidateIdResults] = await connection.query(
      "SELECT candidate_id FROM resume_json_code WHERE uploaded_by_user_id = ?",
      [loggedUserId]
    );

    if (
      !candidateIdResults ||
      (candidateIdResults as mysql.RowDataPacket[]).length === 0
    ) {
      console.error("No candidate IDs found");
      return NextResponse.json(
        { error: "No candidate IDs found" },
        { status: 400 }
      );
    }

    const candidateIds = (candidateIdResults as mysql.RowDataPacket[]).map(
      (row) => row.candidate_id
    );

    // Fetch data for all candidates
    const candidateDataPromises = candidateIds.map(async (candidateId) => {
      const [candidateDataResults] = await connection.query(
        "SELECT * FROM candidate_data WHERE id = ?",
        [candidateId]
      );
      const [workExperienceResults] = await connection.query(
        "SELECT * FROM work_experience WHERE candidate_id = ?",
        [candidateId]
      );

      return {
        candidateData: candidateDataResults as CandidateData[],
        workExperience: workExperienceResults as WorkExperience[],
      };
    });

    const resumeDataArray = await Promise.all(candidateDataPromises);

    return NextResponse.json(resumeDataArray);
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  } finally {
    if (connection) {
      await connection.end(); // Ensure the connection is closed after all queries
    }
  }
}
